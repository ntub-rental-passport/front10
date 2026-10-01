"""報修工單的 API（邏輯在 repairs/service.py）。

三端看的是同一筆資料，差別只在權限與看得到哪些欄位：

- `/api/repairs/...`：租客，只有自己的工單。
- `/api/landlord/repairs/...`：房東，只有自己名下租約的工單。
- `/api/admin/repairs/...`：管理員，全部；多看得到內部註記。

網址上的識別碼一律是對外的案件編號（R-20261001-01），不是資料表的流水號——
三端畫面顯示的、使用者電話裡報的，都是這個編號。

驗證失敗由 service 丟 ValueError，訊息是寫給使用者看的中文，這裡原樣轉成 400；
找不到或沒權限在 service 裡就丟 404（兩者不分，避免被拿來猜別人的工單編號）。
"""

from fastapi import APIRouter, Body, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from auth.security import get_current_admin, get_current_landlord, get_current_tenant
from db.database import get_db
from db.models import User
from repairs import media, service

router = APIRouter(tags=['Repairs'])


def _run(action):
    try:
        return action()
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# ---------------------------------------------------------------------------
# 附件
# ---------------------------------------------------------------------------
#
# 這條路由一定要排在 /api/repairs/{identifier} 前面：FastAPI 依註冊順序比對，
# 反過來的話 photos 會被當成案件編號。


def repair_viewer(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> tuple[User, str]:
    """附件端點的守門員：三種身分都用 Bearer，所以依序試，第一個認得的就是他。

    寫成獨立的相依而不是在端點裡直接呼叫，是為了讓測試能整個換掉——
    直接呼叫的話會繞過 dependency_overrides，測試只能去偽造真的 token。
    """
    for role, resolver in (
        ('tenant', get_current_tenant),
        ('landlord', get_current_landlord),
        ('admin', get_current_admin),
    ):
        try:
            return resolver(authorization=authorization, db=db), role
        except HTTPException:
            continue
    raise HTTPException(status_code=401, detail='請先登入後再查看附件。')


@router.get('/api/repairs/photos/{name}')
def read_repair_photo(
    name: str,
    viewer: tuple[User, str] = Depends(repair_viewer),
    db: Session = Depends(get_db),
) -> FileResponse:
    """報修附件不是公開的：只有這筆工單的租客、對應的房東與管理員看得到。"""
    user, role = viewer
    path = service.photo_path(db, name, user, role)
    return FileResponse(path, media_type=media.TYPES[path.suffix.lstrip('.')])


# ---------------------------------------------------------------------------
# 租客
# ---------------------------------------------------------------------------


@router.get('/api/repairs')
def list_my_repairs(db: Session = Depends(get_db), user: User = Depends(get_current_tenant)) -> dict:
    return {'items': service.listing(db, user, 'tenant')}


@router.post('/api/repairs', status_code=201)
def create_repair(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_tenant),
) -> dict:
    return _run(lambda: service.create(db, payload, user))


@router.get('/api/repairs/{identifier}')
def read_my_repair(
    identifier: str, db: Session = Depends(get_db), user: User = Depends(get_current_tenant)
) -> dict:
    return service.detail(db, identifier, user, 'tenant')


@router.patch('/api/repairs/{identifier}')
def update_my_repair(
    identifier: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_tenant),
) -> dict:
    return _run(lambda: service.patch(db, identifier, payload, user, 'tenant'))


@router.post('/api/repairs/{identifier}/photos', status_code=201)
async def upload_my_repair_file(
    identifier: str,
    file: UploadFile = File(...),
    purpose: str = Form(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_tenant),
) -> dict:
    content = await file.read(media.PDF_LIMIT + 1)
    return _run(lambda: service.upload(db, identifier, user, 'tenant', content, file.filename or '', purpose))


# ---------------------------------------------------------------------------
# 房東
# ---------------------------------------------------------------------------


@router.get('/api/landlord/repairs')
def list_landlord_repairs(
    db: Session = Depends(get_db), user: User = Depends(get_current_landlord)
) -> dict:
    return {'items': service.listing(db, user, 'landlord')}


@router.get('/api/landlord/repairs/{identifier}')
def read_landlord_repair(
    identifier: str, db: Session = Depends(get_db), user: User = Depends(get_current_landlord)
) -> dict:
    return service.detail(db, identifier, user, 'landlord')


@router.patch('/api/landlord/repairs/{identifier}')
def update_landlord_repair(
    identifier: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_landlord),
) -> dict:
    return _run(lambda: service.patch(db, identifier, payload, user, 'landlord'))


@router.post('/api/landlord/repairs/{identifier}/photos', status_code=201)
async def upload_landlord_repair_file(
    identifier: str,
    file: UploadFile = File(...),
    purpose: str = Form(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_landlord),
) -> dict:
    content = await file.read(media.PDF_LIMIT + 1)
    return _run(lambda: service.upload(db, identifier, user, 'landlord', content, file.filename or '', purpose))


# ---------------------------------------------------------------------------
# 管理員
# ---------------------------------------------------------------------------


@router.get('/api/admin/repairs')
def list_all_repairs(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)) -> dict:
    return {'items': service.listing(db, admin, 'admin')}


@router.get('/api/admin/repairs/{identifier}')
def read_any_repair(
    identifier: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)
) -> dict:
    return service.detail(db, identifier, admin, 'admin')


@router.patch('/api/admin/repairs/{identifier}')
def update_any_repair(
    identifier: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> dict:
    return _run(lambda: service.patch(db, identifier, payload, admin, 'admin'))
