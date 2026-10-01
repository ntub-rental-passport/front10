"""報修的權限、狀態機及兩種儲存之間的協調。"""
import copy
import math
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
from sqlalchemy.orm import joinedload
from db.models import RepairTicket, RepairTicketPhoto, LandlordLease, User
from admin import site_settings, audit_service
from repairs import extras, media

CORE_FIELDS = {'location': 'location', 'equipment': 'equipment', 'description': 'description', 'availableTime': 'available_time', 'accessPermission': 'access_permission', 'responsibilityNote': 'responsibility_note', 'vendorName': 'vendor_name', 'vendorPhone': 'vendor_phone'}
TENANT_FIELDS = {'status', 'tenantScheduleReply', 'rescheduleRequest', 'responsibilityAgreement', 'responsibilityQuestion', 'inspectionResult', 'unresolvedNote', 'unresolvedPhotos', 'unresolvedPhotoNames', 'unresolvedSafetyConcern', 'revisitAvailableTime', 'supplements', 'supplementRequested', 'supplementRequestNote', 'photos', 'photoNames', 'interventionRequested'}
LANDLORD_FIELDS = {'status', 'landlordRead', 'responsibility', 'responsibilityNote', 'vendorName', 'vendorPhone', 'scheduledAt', 'estimatedCost', 'actualCost', 'payer', 'receipt', 'quote', 'receiptName', 'quoteName', 'completionNote', 'completionPhotos', 'completionPhotoNames', 'supplementRequested', 'supplementRequestNote', 'tenantScheduleReply', 'rescheduleRequest', 'inspectionResult', 'contactBeforeArrival', 'interventionRequested'}
ADMIN_FIELDS = {'adminNote', 'interventionRequested', 'manuallyQueued'}
CREATE_FIELDS = {'leaseId', 'location', 'equipment', 'description', 'urgency', 'availableTime', 'accessPermission', 'phone', 'photos', 'photoNames', 'tenantUserId', 'propertyId', 'roomId', 'property', 'address', 'room', 'tenant'}
PHOTO_FIELDS = {'photos': 'initial', 'unresolvedPhotos': 'unresolved', 'completionPhotos': 'completion'}
BOOL_FIELDS = {'supplementRequested', 'unresolvedSafetyConcern', 'contactBeforeArrival', 'interventionRequested', 'manuallyQueued', 'landlordRead'}
TEXT_FIELDS = {'adminNote', 'responsibilityNote', 'vendorName', 'vendorPhone', 'payer', 'completionNote', 'supplementRequestNote', 'responsibilityQuestion', 'unresolvedNote', 'revisitAvailableTime', 'receiptName', 'quoteName'}
ENUM_FIELDS = {'responsibility': {'pending', 'landlord', 'tenant', 'shared'}, 'tenantScheduleReply': {'', 'accepted', 'reschedule', 'contact-first'}, 'responsibilityAgreement': {'', 'agreed', 'questioned'}, 'inspectionResult': {'', 'resolved', 'unresolved', 'retry'}}


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(value):
    return value.replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z') if value else ''


def text(value, label, maximum=5000, required=False):
    if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()):
        raise ValueError(f'{label}格式不正確或長度超過限制。')
    return value.strip()


def timestamp(value):
    if not isinstance(value, str) or not value:
        raise ValueError('請填寫有效的維修時間。')
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        # datetime-local 沒有時區，依房東在台灣填寫的時間解讀。
        result = result.replace(tzinfo=extras.TZ) if result.tzinfo is None else result
        return result.astimezone(timezone.utc).replace(tzinfo=None)
    except (ValueError, OverflowError) as error:
        raise ValueError('請填寫有效的維修時間。') from error


def lease_for(db, ticket):
    return db.get(LandlordLease, ticket.lease_id) if ticket.lease_id else None


def authorized(db, ticket, user, role):
    if role == 'admin':
        return True
    if role == 'tenant':
        return ticket.tenant_user_id == user.id
    lease = lease_for(db, ticket)
    return bool(role == 'landlord' and lease and lease.property.landlord_id == user.id and lease.tenant.landlord_id == user.id)


def require_ticket(db, identifier, user, role):
    values = extras.read_all()
    ticket_id = next((key for key, value in values.items() if value['ticketNo'] == identifier), None)
    ticket = db.get(RepairTicket, ticket_id) if ticket_id is not None else None
    if not ticket or not authorized(db, ticket, user, role):
        # 不分「存在但沒權限」與「不存在」，避免猜測別人的工單編號。
        raise HTTPException(404, '找不到這筆報修。')
    return ticket


def defaults():
    return {'estimatedCost': None, 'actualCost': None, 'payer': '待確認', 'quoteName': '', 'receiptName': '', 'quote': None, 'receipt': None, 'tenantScheduleReply': '', 'inspectionResult': '', 'contactBeforeArrival': True, 'supplementRequested': False, 'supplementRequestNote': '', 'supplements': [], 'rescheduleRequest': None, 'responsibilityAgreement': '', 'responsibilityQuestion': '', 'completionNote': '', 'completionPhotos': [], 'completionPhotoNames': [], 'unresolvedNote': '', 'unresolvedPhotos': [], 'unresolvedPhotoNames': [], 'unresolvedSafetyConcern': False, 'revisitAvailableTime': '', 'inventory': {'brand': '', 'model': '', 'moveInStatus': '', 'moveInPhoto': '', 'repairCount': 0}, 'photos': [], 'photoNames': [], 'uploads': [], 'timeline': [], 'awaitingInspection': False, 'adminNote': '', 'interventionRequested': False, 'manuallyQueued': False, 'firstResponseAt': ''}


def event(data, role, title, detail=''):
    data['timeline'].append({'id': uuid.uuid4().hex, 'at': iso(utcnow()), 'title': title, 'detail': detail, 'actorRole': role})


def view(db, ticket, data, role):
    lease = lease_for(db, ticket)
    landlord = db.get(User, lease.property.landlord_id) if lease else None
    tenant = db.get(User, ticket.tenant_user_id)
    result = {**defaults(), **copy.deepcopy(data)}
    result.pop('uploads', None)
    canonical = ticket.status
    ui_status = {'new': 'pending', 'acknowledged': 'processing', 'scheduled': 'processing', 'in_progress': 'processing', 'completed': 'completed', 'cancelled': 'canceled'}[canonical]
    if result['awaitingInspection'] and canonical == 'in_progress':
        ui_status = 'inspection'
    threshold = site_settings.get_settings()['maintenanceOverdueDays']
    overdue = canonical in {'new', 'acknowledged'} and utcnow() - ticket.created_at > timedelta(days=threshold)
    result.update({'id': data['ticketNo'], 'ticketNo': data['ticketNo'], 'tenantUserId': str(ticket.tenant_user_id), 'landlordUserId': str(landlord.id) if landlord else '', 'landlord': (getattr(landlord, 'name', '') or landlord.email) if landlord else '', 'leaseId': str(ticket.lease_id or ''), 'propertyId': str(lease.property_id) if lease else '', 'roomId': str(lease.room_id) if lease else '', 'property': lease.property.name if lease else '', 'address': (lease.property.address or '地址尚未填寫') if lease else '', 'room': lease.room.number if lease else '', 'tenant': lease.tenant.name if lease else (tenant.email if tenant else ''), 'phone': data.get('phone', lease.tenant.phone if lease else ''), 'urgency': {'low': 'normal', 'medium': 'normal', 'high': 'soon', 'urgent': 'emergency'}[ticket.urgency], 'status': ui_status, 'canonicalStatus': canonical, 'landlordRead': bool(ticket.landlord_read_at), 'landlordReadAt': iso(ticket.landlord_read_at), 'notifiedAt': iso(ticket.landlord_read_at), 'responsibility': 'pending' if ticket.responsibility == 'undetermined' else ticket.responsibility, 'scheduledAt': iso(ticket.scheduled_at), 'completedAt': iso(ticket.completed_at), 'createdAt': iso(ticket.created_at), 'updatedAt': iso(ticket.updated_at), 'overdue': overdue, 'disputed': bool(result['responsibilityQuestion'] or result['interventionRequested'])})
    result.update({key: getattr(ticket, column) or '' for key, column in CORE_FIELDS.items()})
    if role != 'admin':
        result.pop('adminNote', None)
        result.pop('manuallyQueued', None)
        # 管理員內部註記不複製到可公開的時間軸。
        result['timeline'] = [item for item in result['timeline'] if not item.get('adminOnly')]
    return result


def listing(db, user, role):
    values = extras.read_all()
    query = db.query(RepairTicket)
    if role == 'tenant':
        query = query.filter(RepairTicket.tenant_user_id == user.id)
    elif role == 'landlord':
        query = query.join(LandlordLease, RepairTicket.lease_id == LandlordLease.id)
    return [view(db, ticket, values[ticket.id], role) for ticket in query.order_by(RepairTicket.created_at.desc(), RepairTicket.id.desc()).all() if ticket.id in values and authorized(db, ticket, user, role)]


def detail(db, identifier, user, role):
    ticket = require_ticket(db, identifier, user, role)
    return view(db, ticket, extras.read_all()[ticket.id], role)


def create(db, payload, user):
    if not isinstance(payload, dict) or set(payload) - CREATE_FIELDS:
        raise ValueError('報修欄位不正確。')
    try:
        lease_id = int(payload.get('leaseId', ''))
    except (ValueError, TypeError):
        raise ValueError('請選擇有效租約。')
    lease = db.get(LandlordLease, lease_id)
    today = datetime.now(extras.TZ).date()
    if not lease or lease.tenant.deleted_at or (lease.tenant.email or '').strip().lower() != user.email.strip().lower() or lease.property.landlord_id != lease.tenant.landlord_id or lease.room.property_id != lease.property_id or lease.status != 'active' or lease.moved_out_at or not lease.start_date <= today <= lease.end_date:
        raise ValueError('找不到屬於你的有效租約，請重新讀取租約。')
    urgency = {'normal': 'medium', 'soon': 'high', 'emergency': 'urgent'}.get(payload.get('urgency', 'normal'))
    access = payload.get('accessPermission', 'contact-first')
    if not urgency or access not in {'present', 'absent', 'contact-first'}:
        raise ValueError('急迫度或進出許可不正確。')
    if payload.get('photos') or payload.get('photoNames'):
        raise ValueError('請先建立工單，再上傳照片。')
    ticket = RepairTicket(tenant_user_id=user.id, lease_id=lease.id, description=text(payload.get('description'), '問題描述', required=True), location=text(payload.get('location', ''), '位置', 100), equipment=text(payload.get('equipment', ''), '設備', 100), urgency=urgency, available_time=text(payload.get('availableTime', ''), '方便時間'), access_permission=access, status='new', responsibility='undetermined', created_at=utcnow(), updated_at=utcnow())
    data = defaults()
    data['phone'] = text(payload.get('phone', lease.tenant.phone), '聯絡電話', 50)
    data['contactBeforeArrival'] = access == 'contact-first'
    with extras.transaction() as connection:
        db.add(ticket)
        try:
            db.flush()
            data['ticketNo'] = extras.reserve_number(connection, ticket.created_at)
            event(data, 'tenant', '租客提交報修')
            extras.write(connection, ticket.id, data)
            db.commit()
        except BaseException:
            db.rollback()
            raise
    return view(db, ticket, data, 'tenant')


def validate_ref(data, ref, purpose):
    if not isinstance(ref, dict):
        raise ValueError('附件資料不正確。')
    found = next((item for item in data['uploads'] if item['id'] == ref.get('id') and item['purpose'] == purpose), None)
    if not found:
        raise ValueError('附件不屬於這筆工單或用途不符，請重新上傳。')
    return copy.deepcopy(found)


def refs(data, values, purpose):
    if not isinstance(values, list) or len(values) > 50:
        raise ValueError('附件清單不正確或超過 50 筆。')
    result = [validate_ref(data, item, purpose) for item in values]
    return list({item['id']: item for item in result}.values())


def validate_updates(data, updates, role):
    for field in BOOL_FIELDS & updates.keys():
        if not isinstance(updates[field], bool):
            raise ValueError('狀態開關必須是是或否。')
    for field in TEXT_FIELDS & updates.keys():
        updates[field] = text(updates[field], '欄位內容', 100 if field == 'vendorName' else 30 if field == 'vendorPhone' else 5000)
    for field, allowed in ENUM_FIELDS.items():
        if field in updates and (not isinstance(updates[field], str) or updates[field] not in allowed):
            raise ValueError('工作流程狀態不正確。')
    for field in {'estimatedCost', 'actualCost'} & updates.keys():
        value = updates[field]
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0 or value > 100000000):
            raise ValueError('費用必須是有效的非負金額。')
    for field, purpose in PHOTO_FIELDS.items():
        if field in updates:
            updates[field] = refs(data, updates[field], purpose)
            name_key = {'photos': 'photoNames', 'unresolvedPhotos': 'unresolvedPhotoNames', 'completionPhotos': 'completionPhotoNames'}[field]
            updates[name_key] = [item['name'] for item in updates[field]]
    for field in {'receipt', 'quote'} & updates.keys():
        updates[field] = validate_ref(data, updates[field], field) if updates[field] is not None else None
        updates[field + 'Name'] = updates[field]['name'] if updates[field] else ''
    for name_key, ref_key in [('photoNames', 'photos'), ('unresolvedPhotoNames', 'unresolvedPhotos'), ('completionPhotoNames', 'completionPhotos')]:
        if name_key in updates and ref_key not in updates:
            updates[name_key] = [item['name'] for item in data.get(ref_key, [])]
    for field in ('receipt', 'quote'):
        if field + 'Name' in updates and field not in updates:
            updates[field + 'Name'] = (data.get(field) or {}).get('name', '')
    if 'supplements' in updates:
        incoming = updates['supplements']
        if not isinstance(incoming, list) or len(incoming) > 200:
            raise ValueError('補件資料格式不正確。')
        existing = {item['id'] for item in data['supplements']}
        additions = []
        for item in incoming:
            if not isinstance(item, dict):
                raise ValueError('補件資料格式不正確。')
            if item.get('id') in existing:
                continue
            photos = refs(data, item.get('photos', []), 'supplement')
            note = text(item.get('note', ''), '補充說明')
            if not note and not photos:
                raise ValueError('請填写補充說明或上傳照片。')
            additions.append({'id': uuid.uuid4().hex, 'at': iso(utcnow()), 'note': note, 'photos': photos, 'photoNames': [photo['name'] for photo in photos]})
        if not additions:
            raise ValueError('請提供新的補件內容。')
        updates['supplements'] = data['supplements'] + additions
    if 'rescheduleRequest' in updates and updates['rescheduleRequest'] is not None:
        value = updates['rescheduleRequest']
        if role != 'tenant' or not isinstance(value, dict):
            raise ValueError('改期資料不正確。')
        clean = {}
        for field in ('date', 'startTime', 'endTime', 'alternativeDate', 'alternativeStartTime', 'alternativeEndTime', 'note'):
            clean[field] = text(value.get(field, ''), '改期資料', 5000 if field == 'note' else 30)
        for prefix in ('', 'alternative'):
            date_key = 'date' if not prefix else 'alternativeDate'
            start_key = 'startTime' if not prefix else 'alternativeStartTime'
            end_key = 'endTime' if not prefix else 'alternativeEndTime'
            if prefix and not clean[date_key]:
                continue
            start = timestamp(clean[date_key] + 'T' + clean[start_key])
            end = timestamp(clean[date_key] + 'T' + clean[end_key])
            if end <= start:
                raise ValueError('改期結束時間必須晚於開始時間。')
        clean['status'] = 'pending'
        updates['rescheduleRequest'] = clean


def transition(ticket, data, updates, role):
    status = updates.pop('status', None)
    if status is not None and status not in {'pending', 'processing', 'inspection', 'completed', 'canceled'}:
        raise ValueError('工單狀態不正確。')
    if role == 'admin':
        return '管理員更新工單註記與處理佇列'
    if ticket.status in {'completed', 'cancelled'}:
        if set(updates) <= {'landlordRead'} and status is None:
            return '房東已讀報修內容'
        raise ValueError('此案件已結束，不能再修改流程。')
    title = '租客更新報修資料' if role == 'tenant' else '房東更新處理資料'
    if role == 'tenant':
        if 'tenantScheduleReply' in updates and updates['tenantScheduleReply'] and not ticket.scheduled_at:
            raise ValueError('房東尚未排程，不能回覆維修時間。')
        if updates.get('responsibilityAgreement') == 'questioned' and not updates.get('responsibilityQuestion', data['responsibilityQuestion']):
            raise ValueError('請填寫責任異議的原因。')
        if updates.get('responsibilityAgreement') == 'agreed':
            updates['responsibilityQuestion'] = ''
        if 'supplementRequested' in updates and (updates['supplementRequested'] or 'supplements' not in updates):
            raise ValueError('補件送出後才能解除補件要求。')
        if 'supplementRequestNote' in updates and (updates['supplementRequestNote'] or 'supplements' not in updates):
            raise ValueError('不能修改房東的補件要求。')
        if status == 'completed' or updates.get('inspectionResult') == 'resolved':
            if not data['awaitingInspection'] or status != 'completed' or updates.get('inspectionResult') != 'resolved':
                raise ValueError('請先等待房東送出完修，再確認驗收結果。')
            ticket.status, ticket.completed_at, data['awaitingInspection'] = 'completed', utcnow(), False
            title = '租客驗收通過，案件完成'
        elif updates.get('inspectionResult') in {'unresolved', 'retry'}:
            if not data['awaitingInspection'] or status != 'processing' or not updates.get('unresolvedNote', '').strip():
                raise ValueError('請在待驗收案件填寫尚未解決的原因。')
            ticket.status, data['awaitingInspection'] = 'in_progress', False
            title = '租客回報问题仍未解決'
        elif status == 'canceled':
            if ticket.status not in {'new', 'acknowledged'}:
                raise ValueError('維修已安排，請先與房東確認取消。')
            ticket.status = 'cancelled'
            title = '租客取消報修'
        elif status is not None:
            raise ValueError('租客不能直接變更維修進度。')
        elif 'inspectionResult' in updates:
            raise ValueError('驗收結果必須與驗收動作一起送出。')
    else:
        if updates.get('landlordRead') is False:
            raise ValueError('已讀紀錄不能改回未讀。')
        if updates.get('landlordRead') and not ticket.landlord_read_at:
            ticket.landlord_read_at = utcnow()
            if ticket.status == 'new':
                ticket.status = 'acknowledged'
            title = '房東已讀報修內容'
        for field in ('tenantScheduleReply', 'rescheduleRequest', 'inspectionResult'):
            if field in updates and (not updates.get('scheduledAt') or updates[field] not in ('', None)):
                raise ValueError('只有重新排程才能重設租客的排程回覆。')
        if status == 'completed':
            raise ValueError('房東只能送出租客驗收，不能代替租客完成案件。')
        if status == 'inspection':
            if ticket.status not in {'scheduled', 'in_progress', 'acknowledged'} or data['awaitingInspection']:
                raise ValueError('案件尚未開始處理或已在等待驗收。')
            ticket.status, data['awaitingInspection'] = 'in_progress', True
            updates['inspectionResult'] = ''
            title = '維修完成，等待租客驗收'
        elif status == 'canceled':
            if not updates.get('responsibilityNote') or ticket.status not in {'new', 'acknowledged'}:
                raise ValueError('請在尚未排程時填寫不受理原因。')
            ticket.status = 'cancelled'
            title = '房東說明不受理原因'
        elif status == 'pending':
            if not updates.get('supplementRequested') or not updates.get('supplementRequestNote'):
                raise ValueError('請填寫需要補充的資料。')
            ticket.status = 'acknowledged'
            title = '房東要求補充資料'
        elif status == 'processing':
            if data['awaitingInspection']:
                raise ValueError('案件正在等待租客驗收。')
            ticket.status = 'scheduled' if updates.get('scheduledAt') else ('acknowledged' if ticket.status == 'new' else 'in_progress')
            title = '房東接受處理' if ticket.status == 'acknowledged' else '房東更新維修安排'
        if 'scheduledAt' in updates:
            if data['awaitingInspection']:
                raise ValueError('案件正在等待租客驗收。')
            ticket.scheduled_at = timestamp(updates.pop('scheduledAt'))
            ticket.status = 'scheduled'
            title = '房東已安排維修時間'
        if not data['firstResponseAt']:
            data['firstResponseAt'] = iso(utcnow())
    return title


def patch(db, identifier, payload, user, role):
    ticket = require_ticket(db, identifier, user, role)
    if not isinstance(payload, dict) or set(payload) - {'updates', 'event'} or not isinstance(payload.get('updates'), dict):
        raise ValueError('更新資料格式不正確。')
    updates = copy.deepcopy(payload['updates'])
    allowed = {'tenant': TENANT_FIELDS, 'landlord': LANDLORD_FIELDS, 'admin': ADMIN_FIELDS}[role]
    if not updates or set(updates) - allowed:
        raise ValueError('包含此身分不能修改的欄位。')
    incoming_event = payload.get('event') or {}
    if not isinstance(incoming_event, dict):
        raise ValueError('操作說明格式不正確。')
    detail_text = text(incoming_event.get('detail', ''), '操作說明')
    with extras.transaction() as connection:
        # SQLite 寫鎖覆蓋讀取到提交，避免同一案件併發更新丟失時間軸。
        db.refresh(ticket)
        if not authorized(db, ticket, user, role):
            raise HTTPException(404, '找不到這筆報修。')
        data = extras.read(connection, ticket.id)
        validate_updates(data, updates, role)
        title = transition(ticket, data, updates, role)
        for field, value in updates.items():
            if field in CORE_FIELDS:
                setattr(ticket, CORE_FIELDS[field], value)
            elif field == 'responsibility':
                ticket.responsibility = 'undetermined' if value == 'pending' else value
            elif field != 'landlordRead':
                data[field] = value
        ticket.updated_at = utcnow()
        event(data, role, title, '' if role == 'admin' else detail_text)
        if role == 'admin':
            data['timeline'][-1]['adminOnly'] = True
        try:
            extras.write(connection, ticket.id, data)
            db.commit()
        except BaseException:
            db.rollback()
            raise
    if role == 'admin':
        audit_service.record('報修工單', identifier, title, actor=user.email, subject='repair:' + identifier)
    return view(db, ticket, data, role)


def upload(db, identifier, user, role, content, filename, purpose):
    ticket = require_ticket(db, identifier, user, role)
    allowed = {'tenant': {'initial', 'supplement', 'unresolved'}, 'landlord': {'completion', 'receipt', 'quote'}}
    if purpose not in allowed.get(role, set()):
        raise ValueError('這個身分不能上傳此用途的附件。')
    with extras.transaction() as connection:
        db.refresh(ticket)
        if ticket.status in {'completed', 'cancelled'}:
            raise ValueError('案件已結束，不能再上傳附件。')
        data = extras.read(connection, ticket.id)
        if len(data['uploads']) >= 100:
            raise ValueError('每筆工單最多保留 100 個附件。')
        item = media.save(content, filename, purpose)
        existing = next((ref for ref in data['uploads'] if ref['url'] == item['url'] and ref['purpose'] == purpose), None)
        if existing:
            return existing
        photo = RepairTicketPhoto(ticket_id=ticket.id, photo_url=item['url'], photo_name=item['name'])
        try:
            db.add(photo)
            db.flush()
            item['id'] = str(photo.id)
            data['uploads'].append(item)
            if purpose in {'receipt', 'quote'}:
                data[purpose] = item
                data[purpose + 'Name'] = item['name']
            elif purpose in {'initial', 'unresolved', 'completion'}:
                field = {'initial': 'photos', 'unresolved': 'unresolvedPhotos', 'completion': 'completionPhotos'}[purpose]
                data[field].append(item)
                name_field = {'initial': 'photoNames', 'unresolved': 'unresolvedPhotoNames', 'completion': 'completionPhotoNames'}[purpose]
                data[name_field].append(item['name'])
            ticket.updated_at = utcnow()
            event(data, role, '上傳報修附件', item['name'])
            extras.write(connection, ticket.id, data)
            db.commit()
        except BaseException:
            db.rollback()
            # 未連結的雜湊檔沒有讀取權限；不刪除，避免刪掉其他工單併發使用的同圖。
            raise
    return item


def photo_path(db, name, user, role):
    path = media.path_of(name)
    if path:
        url = '/api/repairs/photos/' + name
        tickets = db.query(RepairTicket).join(RepairTicketPhoto, RepairTicketPhoto.ticket_id == RepairTicket.id).filter(RepairTicketPhoto.photo_url == url).all()
        if any(authorized(db, ticket, user, role) for ticket in tickets):
            return path
    raise HTTPException(404, '找不到這個附件。')
