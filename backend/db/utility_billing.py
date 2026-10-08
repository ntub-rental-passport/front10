"""Tenant-entered utility calculations; final amounts are rounded to whole dollars."""
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, model_validator


class UtilityEntry(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

    method: Literal['pending', 'amount', 'meter', 'shared', 'master', 'included']
    payer: Literal['landlord_collect', 'tenant_direct', 'landlord_absorb'] = 'landlord_collect'
    recorded_on: date | None = None
    amount: Decimal | None = Field(default=None, ge=0, le=100_000_000)
    previous: Decimal | None = Field(default=None, ge=0, le=100_000_000)
    current: Decimal | None = Field(default=None, ge=0, le=100_000_000)
    rate: Decimal | None = Field(default=None, ge=0, le=100_000)
    total: Decimal | None = Field(default=None, ge=0, le=100_000_000)
    share: Decimal | None = Field(default=None, gt=0, le=100_000_000)
    shares: Decimal | None = Field(default=None, gt=0, le=100_000_000)
    main_usage: Decimal | None = Field(default=None, gt=0, le=100_000_000)
    sub_usage: Decimal | None = Field(default=None, ge=0, le=100_000_000)

    @model_validator(mode='after')
    def validate_calculation(self):
        required = {
            'pending': (), 'included': (), 'amount': ('amount',),
            'meter': ('previous', 'current', 'rate'),
            'shared': ('total', 'share', 'shares'),
            'master': ('previous', 'current', 'total', 'share', 'shares', 'main_usage', 'sub_usage'),
        }[self.method]
        if self.method == 'amount' and self.payer != 'landlord_collect' and self.amount is None:
            required = ()
        if any(getattr(self, key) is None for key in required):
            raise ValueError('請完整填寫此計費方式所需欄位。')
        for key in type(self).model_fields:
            if key not in ('method', 'payer', 'recorded_on') and key not in required and getattr(self, key) is not None:
                raise ValueError('包含不適用此計費方式的欄位。')
        if self.method in ('meter', 'master') and self.current <= self.previous:
            raise ValueError('本期讀數必須大於上期讀數，請確認是否抄錯或更換電表。')
        if self.method in ('shared', 'master') and self.share > self.shares:
            raise ValueError('我的份數不可超過總份數。')
        if self.method == 'master' and not self.current - self.previous <= self.sub_usage <= self.main_usage:
            raise ValueError('分表總用量須介於我的用量與主表用量之間。')
        if self.calculate() is not None and self.calculate() > 100_000_000:
            raise ValueError('計算金額超過上限。')
        return self

    def calculate(self) -> int | None:
        if self.method == 'pending':
            return None
        if self.method == 'included':
            return 0
        if self.method == 'amount':
            value = self.amount or Decimal(0)
        elif self.method == 'meter':
            value = (self.current - self.previous) * self.rate
        elif self.method == 'shared':
            value = self.total * self.share / self.shares
        else:
            # Bill-derived average rate; shared common usage is charged only once.
            usage = self.current - self.previous
            common = (self.main_usage - self.sub_usage) * self.share / self.shares
            value = self.total * (usage + common) / self.main_usage
        return int(value.quantize(Decimal('1'), rounding=ROUND_HALF_UP))

    def receivable(self) -> int | None:
        return self.calculate() if self.payer == 'landlord_collect' else 0


class UtilitiesPayload(BaseModel):
    model_config = ConfigDict(extra='forbid')
    electricity: UtilityEntry
    water: UtilityEntry
