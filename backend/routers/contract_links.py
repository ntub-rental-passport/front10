"""租客自存合約 ↔ 房東平台租約：逐項對照、帳款檢查、條件變更紀錄。

前提：要假設有一方可能亂來。房東平台的資料全由房東輸入，租客自存的合約是掃描
紙本、雙方簽名的那份；兩份都保留，誰也不蓋掉誰。系統做的是：

- 對應時逐項比對條件（月租、押金、租期、繳租日、週期、地址、房號），差異同時給雙方看，
  房東可以寫說明，紀錄保留。
- 之後每一期帳款都拿合約檢查：租金金額、電費每度單價跟合約不同就標示，租客可以提出異議。
- 房東在對應之後改租約條件，修改前後都記下來並通知租客，不能悄悄改。

系統判斷不了哪一方說的是真的（租客掃描時也可能改內容），只負責把差異攤開、留下紀錄。
"""
import re
import unicodedata
from datetime import date, datetime
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth.landlord_workspace import get_landlord_workspace, landlord_actor, record_audit
from auth.security import get_current_tenant
from db.database import get_db
from db.models import LandlordCharge, LandlordChargeEvent, LandlordLease, LeaseContractLink, Rental, User, UtilityEvidence
from notifications.user_notify import notify_user

tenant_router = APIRouter(prefix="/api/tenant/landlord-leases", tags=["Lease contract links (tenant)"])
landlord_router = APIRouter(prefix="/api/landlord/contracts", tags=["Lease contract links (landlord)"])

FREQUENCY_MONTHS = {"monthly": 1, "bimonthly": 2, "quarterly": 3}
FREQUENCY_LABEL = {1: "月繳", 2: "每 2 個月", 3: "季繳"}


class LinkPayload(BaseModel):
    rental_id: int


class NotePayload(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


class DisputePayload(BaseModel):
    amount: int = Field(ge=0, le=100_000_000)
    note: str = Field(min_length=1, max_length=1000)


# ---------------------------------------------------------------
# 條件與比對
# ---------------------------------------------------------------

def contract_terms(db: Session, rental_id: int) -> dict | None:
    """自存合約的條件。只選明文欄位：加密欄位解不開時不能讓對照整個失敗。"""
    row = (
        db.query(Rental.id, Rental.user_id, Rental.contract_tag, Rental.address, Rental.rental_room, Rental.start_date,
                 Rental.end_date, Rental.rent_amount, Rental.deposit_amount, Rental.payment_day,
                 Rental.payment_interval_months, Rental.electricity_fee_type, Rental.electricity_fee_rate,
                 Rental.rental_status)
        .filter(Rental.id == rental_id).first()
    )
    return row._asdict() if row else None


def _normalize_address(value: str | None) -> str:
    text = unicodedata.normalize("NFKC", value or "").replace("台", "臺")
    return re.sub(r"[\s,，、()（）]", "", text)


def _rate(value) -> float | None:
    match = re.search(r"\d+(?:\.\d+)?", unicodedata.normalize("NFKC", str(value or "")))
    return float(match.group()) if match else None


def compare_terms(terms: dict, lease: LandlordLease) -> list[dict]:
    """逐項比對。只列出兩邊都有資料而且不同的項目。"""
    differences = []

    def add(field, label, contract_value, landlord_value):
        differences.append({"field": field, "label": label, "contract": contract_value, "landlord": landlord_value})

    if terms["rent_amount"] != lease.monthly_rent:
        add("rent", "月租", terms["rent_amount"], lease.monthly_rent)
    if terms["deposit_amount"] != lease.deposit_amount:
        add("deposit", "押金", terms["deposit_amount"], lease.deposit_amount)
    if terms["start_date"] != lease.start_date:
        add("start", "租期開始", terms["start_date"].isoformat(), lease.start_date.isoformat())
    if terms["end_date"] != lease.end_date:
        add("end", "租期結束", terms["end_date"].isoformat(), lease.end_date.isoformat())
    if terms["payment_day"] != lease.payment_day:
        add("payment_day", "每期繳租日", terms["payment_day"], lease.payment_day)
    landlord_months = FREQUENCY_MONTHS.get(lease.payment_frequency or "monthly", 1)
    if (terms["payment_interval_months"] or 1) != landlord_months:
        add("frequency", "繳租週期", FREQUENCY_LABEL.get(terms["payment_interval_months"] or 1, f"每 {terms['payment_interval_months']} 個月"),
            FREQUENCY_LABEL.get(landlord_months, lease.payment_frequency))
    contract_address = _normalize_address(terms["address"])
    landlord_address = _normalize_address(lease.property.address if lease.property else "")
    if contract_address and landlord_address and contract_address not in landlord_address and landlord_address not in contract_address:
        add("address", "地址", terms["address"], lease.property.address)
    room = (lease.room.number if lease.room else "").strip()
    if terms["rental_room"] and room and _normalize_address(room) not in _normalize_address(terms["rental_room"]):
        add("room", "房號／出租範圍", terms["rental_room"], room)
    return differences


def lease_snapshot(lease: LandlordLease) -> dict:
    """房東可改的租約條件，用來比對修改前後。"""
    return {
        "monthly_rent": lease.monthly_rent, "deposit_amount": lease.deposit_amount,
        "start_date": lease.start_date.isoformat() if lease.start_date else None,
        "end_date": lease.end_date.isoformat() if lease.end_date else None,
        "payment_day": lease.payment_day, "payment_frequency": lease.payment_frequency,
        "room_id": lease.room_id,
    }


SNAPSHOT_LABELS = {"monthly_rent": "月租", "deposit_amount": "押金", "start_date": "租期開始", "end_date": "租期結束",
                   "payment_day": "每期繳租日", "payment_frequency": "繳租週期", "room_id": "房間"}


def record_term_change(db: Session, lease: LandlordLease, before: dict, actor: User | None) -> None:
    """房東改了已綁定租客（或已對應合約）的租約條件：記下前後、重新比對、通知租客。

    呼叫端在 commit 之前呼叫（跟修改同一筆交易）。
    """
    after = lease_snapshot(lease)
    changes = [{"field": key, "label": SNAPSHOT_LABELS[key], "before": before.get(key), "after": after.get(key)}
               for key in SNAPSHOT_LABELS if before.get(key) != after.get(key)]
    if not changes:
        return
    link = db.query(LeaseContractLink).filter(LeaseContractLink.lease_id == lease.id).first()
    if link:
        entry = {"at": datetime.utcnow().isoformat(), "by": actor.id if actor else None, "changes": changes}
        link.term_history = [*(link.term_history or []), entry]
        terms = contract_terms(db, link.rental_id)
        if terms:
            db.flush()
            link.differences = compare_terms(terms, lease)
    tenant_user = db.get(User, lease.tenant_user_id) if lease.tenant_user_id else None
    if tenant_user:
        summary = "、".join(f"{c['label']} {c['before']} → {c['after']}" for c in changes)
        notify_user(db, tenant_user, title="房東修改了你的租約條件", category="租約", source_label="租約變更",
                    body=f"{lease.property.name if lease.property else ''} {lease.room.number if lease.room else ''}：{summary}。"
                         + ("與你存的合約不同的地方會標示出來，有疑問請跟房東確認。" if link else ""),
                    created_by="system", action_url="/app", action_label="查看租約")


def expected_rents(terms: dict, lease: LandlordLease) -> dict:
    """依合約上的月租與週期，這份租約每一期「應該」收多少（以期起日為鍵）。"""
    from routers.landlord_finance import rent_periods

    months = terms["payment_interval_months"] or 1
    pseudo = SimpleNamespace(
        start_date=lease.start_date, end_date=lease.end_date, moved_out_at=lease.moved_out_at,
        payment_day=lease.payment_day, monthly_rent=terms["rent_amount"], status=lease.status,
        payment_frequency={1: "monthly", 2: "bimonthly", 3: "quarterly"}.get(months, "monthly"),
    )
    return {start: amount for start, _, _, amount in rent_periods(pseudo, date.max)}


def charge_mismatches(charge: LandlordCharge, terms: dict | None, expected: dict | None) -> list[dict]:
    """這筆帳款跟合約不符的地方。沒有對應合約就不檢查。"""
    if not terms:
        return []
    found = []
    if charge.kind == "rent" and expected is not None:
        should = expected.get(charge.period_start)
        if should is not None and should != charge.amount:
            found.append({"label": "租金", "contract": should, "landlord": charge.amount})
    if charge.kind == "electricity":
        contract_rate = _rate(terms.get("electricity_fee_rate"))
        details = charge.utility_details or {}
        landlord_rate = _rate(details.get("rate")) if details.get("method") == "meter" else None
        if contract_rate is not None and landlord_rate is not None and abs(contract_rate - landlord_rate) > 1e-6:
            found.append({"label": "電費每度單價", "contract": contract_rate, "landlord": landlord_rate})
    return found


def link_context(db: Session, lease: LandlordLease) -> tuple[dict | None, dict | None]:
    """(合約條件, 依合約每期應收) —— 沒有對應合約就是 (None, None)。"""
    link = db.query(LeaseContractLink).filter(LeaseContractLink.lease_id == lease.id).first()
    terms = contract_terms(db, link.rental_id) if link else None
    return terms, (expected_rents(terms, lease) if terms else None)


def link_json(db: Session, link: LeaseContractLink | None, lease: LandlordLease, include_terms: bool = True) -> dict:
    if not link:
        return {"linked": False}
    terms = contract_terms(db, link.rental_id)
    return {
        "linked": True,
        "rental_id": link.rental_id,
        "contract_title": (terms or {}).get("contract_tag") or (terms or {}).get("address", "")[:16],
        "contract_terms": {
            "rent": terms["rent_amount"], "deposit": terms["deposit_amount"], "start": terms["start_date"],
            "end": terms["end_date"], "payment_day": terms["payment_day"],
            "frequency": FREQUENCY_LABEL.get(terms["payment_interval_months"] or 1),
            "electricity": terms["electricity_fee_rate"] or terms["electricity_fee_type"],
        } if terms and include_terms else None,
        "differences": link.differences or [],
        "landlord_note": link.landlord_note or "",
        "landlord_noted_at": link.landlord_noted_at,
        "term_history": link.term_history or [],
        "linked_at": link.created_at,
    }


# ---------------------------------------------------------------
# 租客
# ---------------------------------------------------------------

def _overlapping(db: Session, user: User, lease: LandlordLease) -> list[dict]:
    end = lease.moved_out_at or lease.end_date
    rows = (
        db.query(Rental.id, Rental.contract_tag, Rental.address, Rental.start_date, Rental.end_date)
        .filter(Rental.user_id == user.id, Rental.rental_status == "active",
                Rental.start_date <= end, Rental.end_date >= lease.start_date)
        .all()
    )
    return [{"rental_id": row.id, "title": row.contract_tag or (row.address or "")[:16] or f"租約 #{row.id}",
             "address": row.address or "", "start": row.start_date, "end": row.end_date} for row in rows]


@tenant_router.get("/{lease_id}/link")
def tenant_link(lease_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_tenant)):
    from routers.tenant_landlord_leases import _visible_lease

    lease = _visible_lease(db, user, lease_id)
    link = db.query(LeaseContractLink).filter(LeaseContractLink.lease_id == lease.id).first()
    return {**link_json(db, link, lease), "candidates": [] if link else _overlapping(db, user, lease)}


@tenant_router.post("/{lease_id}/link", status_code=status.HTTP_201_CREATED)
def tenant_create_link(lease_id: int, payload: LinkPayload, db: Session = Depends(get_db), user: User = Depends(get_current_tenant)):
    """把自己存的合約對應到這份房東租約：逐項比對，自存那份不再出現在首頁帳務、報修與點交。"""
    from routers.tenant_landlord_leases import _visible_lease

    lease = _visible_lease(db, user, lease_id)
    if db.query(LeaseContractLink.id).filter(LeaseContractLink.lease_id == lease.id).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "這份房東租約已經對應過合約了，要換請先取消對應。")
    terms = contract_terms(db, payload.rental_id)
    if not terms or terms["user_id"] != user.id or terms["rental_status"] != "active":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這份合約，或它已經對應到其他租約。")
    differences = compare_terms(terms, lease)
    link = LeaseContractLink(lease_id=lease.id, rental_id=payload.rental_id, tenant_user_id=user.id,
                             differences=differences, term_history=[])
    db.add(link)
    db.query(Rental).filter(Rental.id == payload.rental_id).update({Rental.rental_status: "linked"}, synchronize_session=False)
    landlord = db.get(User, lease.tenant.landlord_id)
    if landlord:
        from routers.landlord_workspace_api import settings_for

        detail = "；".join(f"{d['label']}：合約 {d['contract']}，你記錄 {d['landlord']}" for d in differences)
        record_audit(db, landlord, user, "租客", "租客對應簽約合約",
                     f"{lease.tenant.name}：" + (f"{len(differences)} 項不一致（{detail}）" if differences else "條件一致"))
        if differences:
            notify_user(db, landlord, title=f"{lease.tenant.name} 的合約與你登記的租約有 {len(differences)} 處不同",
                        body=f"{detail}。請到合約管理確認，修正租約或寫下說明。",
                        category="租約", source_label="合約對照", created_by=f"tenant:{user.id}",
                        action_url="/landlord/contracts", action_label="查看對照",
                        email=settings_for(db, landlord).email_notifications)
    db.commit()
    db.refresh(link)
    return link_json(db, link, lease)


@tenant_router.delete("/{lease_id}/link")
def tenant_remove_link(lease_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_tenant)):
    from routers.tenant_landlord_leases import _visible_lease

    lease = _visible_lease(db, user, lease_id)
    link = db.query(LeaseContractLink).filter(LeaseContractLink.lease_id == lease.id).first()
    if not link:
        return {"linked": False}
    db.query(Rental).filter(Rental.id == link.rental_id, Rental.rental_status == "linked").update(
        {Rental.rental_status: "active"}, synchronize_session=False)
    db.delete(link)
    db.commit()
    return {"linked": False}


@tenant_router.post("/charges/{charge_id}/dispute", status_code=status.HTTP_201_CREATED)
def tenant_dispute_charge(charge_id: int, payload: DisputePayload, db: Session = Depends(get_db),
                          user: User = Depends(get_current_tenant)):
    """租客認為這筆帳款金額不對（通常是跟合約不符）：提出主張的金額與理由，房東處理。"""
    from routers.tenant_leases import tenant_visible_leases

    charge = db.get(LandlordCharge, charge_id)
    lease = next((item for item in tenant_visible_leases(db, user) if charge and item.id == charge.lease_id), None)
    if not charge or not lease or charge.voided_at:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這筆帳款。")
    if db.query(UtilityEvidence.id).filter(UtilityEvidence.charge_id == charge.id, UtilityEvidence.kind == "charge_dispute",
                                           UtilityEvidence.status == "open").first():
        raise HTTPException(status.HTTP_409_CONFLICT, "你對這筆帳款的異議房東還在處理，請等候回覆。")
    item = UtilityEvidence(charge_id=charge.id, kind="charge_dispute", role="tenant", submitted_by=user.id,
                           amount=payload.amount, note=payload.note.strip(), status="open")
    db.add(item)
    detail = f"租客對金額提出異議：主張 NT${payload.amount:,}（目前 NT${charge.amount:,}），理由：{payload.note.strip()}"
    db.add(LandlordChargeEvent(charge_id=charge.id, kind="charge_dispute", detail=detail, actor_user_id=user.id))
    landlord = db.get(User, lease.tenant.landlord_id)
    if landlord:
        from routers.landlord_workspace_api import settings_for

        record_audit(db, landlord, user, "帳務", "租客對帳款提出異議", f"{lease.tenant.name}：{charge.title}，{detail}")
        notify_user(db, landlord, title=f"{lease.tenant.name} 對「{charge.title}」提出異議",
                    body=f"{detail}。請到財務管理確認。", category="帳務", source_label="帳款異議",
                    created_by=f"tenant:{user.id}", action_url="/landlord/finance", action_label="處理異議",
                    email=settings_for(db, landlord).email_notifications)
    db.commit()
    from routers.utility_evidence import evidence_json
    return evidence_json(item)


# ---------------------------------------------------------------
# 房東
# ---------------------------------------------------------------

def _owned_lease(db: Session, landlord: User, lease_id: int) -> LandlordLease:
    from routers.landlord_contracts import _owned_lease as owned
    return owned(db, landlord.id, lease_id)


@landlord_router.get("/{lease_id}/tenant-contract")
def landlord_link(lease_id: int, db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    """租客簽約合約與你登記的租約的對照（只給條件，不給租客合約上的個資）。"""
    lease = _owned_lease(db, landlord, lease_id)
    link = db.query(LeaseContractLink).filter(LeaseContractLink.lease_id == lease.id).first()
    return link_json(db, link, lease)


@landlord_router.put("/{lease_id}/tenant-contract/note")
def landlord_note(lease_id: int, payload: NotePayload, request: Request, db: Session = Depends(get_db),
                  landlord: User = Depends(get_landlord_workspace)):
    lease = _owned_lease(db, landlord, lease_id)
    link = db.query(LeaseContractLink).filter(LeaseContractLink.lease_id == lease.id).first()
    if not link:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "租客還沒有把合約對應到這份租約。")
    link.landlord_note = payload.note.strip()
    link.landlord_noted_at = datetime.utcnow()
    record_audit(db, landlord, landlord_actor(request, landlord), "合約", "說明合約對照差異", payload.note.strip())
    tenant_user = db.get(User, lease.tenant_user_id) if lease.tenant_user_id else None
    if tenant_user:
        notify_user(db, tenant_user, title="房東說明了合約與租約的差異", body=payload.note.strip(), category="租約",
                    source_label="合約對照", created_by=f"landlord:{landlord.id}", action_url="/app", action_label="查看")
    db.commit()
    return link_json(db, link, lease)
