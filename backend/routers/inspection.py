import base64
import io
import json
import os
import re
import uuid
from pathlib import Path
from typing import Optional
import traceback
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from openai import OpenAI
from PIL import Image, ImageOps
from pydantic import BaseModel

# 自動載入專案根目錄的 .env
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")

router = APIRouter(prefix="/api/inspection", tags=["Inspection"])

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=NVIDIA_API_KEY,
    timeout=60.0,
)

def compress_image(base64_data_url: str, max_size=(1280, 1280)) -> str:
    """去除 DataURL 前綴、校正方向並壓縮為 JPEG Base64 字串"""
    if "," in base64_data_url:
        _, raw_b64 = base64_data_url.split(",", 1)
    else:
        raw_b64 = base64_data_url

    img_bytes = base64.b64decode(raw_b64)
    with Image.open(io.BytesIO(img_bytes)) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.thumbnail(max_size, Image.Resampling.LANCZOS)

        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=88, optimize=True)
        compressed_bytes = buffer.getvalue()

    return base64.b64encode(compressed_bytes).decode("utf-8")

def clean_and_parse_json(raw_text: str) -> dict:
    """濾除 Markdown 區塊並解析 JSON"""
    text = raw_text.strip()
    if "```" in text:
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()
    match = re.search(r"(\{.*\})", text, re.DOTALL)
    if match:
        text = match.group(1)
    return json.loads(text)

class InspectRequest(BaseModel):
    image_data: str
    item_name: Optional[str] = "未指定物品"
    room_name: Optional[str] = "未指定房間"

@router.post("/analyze")
async def analyze_defect(req: InspectRequest):
    current_key = os.getenv("NVIDIA_API_KEY") or NVIDIA_API_KEY
    if not current_key:
        print("[Inspection Error] 未在 .env 讀取到 NVIDIA_API_KEY！")
        raise HTTPException(status_code=500, detail="未在 .env 中設定 NVIDIA_API_KEY")

    try:
        compressed_b64 = compress_image(req.image_data)
    except Exception as e:
        print(f"[Inspection Error] 圖片壓縮失敗: {e}")
        raise HTTPException(status_code=400, detail=f"圖片解析失敗: {e}")

    # 簡短、通用且扁平的 Prompt
    system_prompt = (
        "你是一位專精於租賃點交存證的專業查驗員。\n"
        "必須嚴格輸出合法 JSON，不得包含 Markdown 標籤或解說。\n"
        "必須直接以 '{' 開頭，以 '}' 結尾。\n\n"
        "JSON 欄位格式規範：\n"
        "{\n"
        '  "item_type": "畫面中實際的主體材質與名稱（例如：白色水泥粉刷牆、綠色木門、磁磚）",\n'
        '  "has_defect": true,\n'
        '  "defect_summary": "具體客觀描述損傷外觀、走向或受損特徵",\n'
        '  "severity": "輕微|中度|嚴重",\n'
        '  "cause_inference": "結構沉降/地震|人為外力撞擊|自然折舊磨損|環境潮濕滲漏|無"\n'
        "}"
    )

    user_prompt = (
        f"點交登記項目為【{req.room_name} - {req.item_name}】。\n"
        "請根據這張照片中實際呈現的物體外觀與損傷特徵進行客觀判定，直接輸出 JSON。"
    )

    try:
        response = client.chat.completions.create(
            model="meta/llama-3.2-11b-vision-instruct",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{compressed_b64}"}
                        },
                    ],
                },
            ],
            temperature=0.1,
            max_tokens=1024,  # 放寬上限，避免 JSON 被截斷
            response_format={"type": "json_object"},
        )

        raw_output = response.choices[0].message.content
        print(f"\n[VLM 原始回傳]:\n{raw_output}\n")
        
        parsed = clean_and_parse_json(raw_output)

        print("=" * 20 + " [VLM 辨識結果] " + "=" * 20)
        print(f"物件主體: {parsed.get('item_type')}")
        print(f"是否有損壞: {parsed.get('has_defect')}")
        print(f"損壞摘要: {parsed.get('defect_summary')}")
        print(f"嚴重程度: {parsed.get('severity')}")
        print(f"成因推論: {parsed.get('cause_inference')}")
        print("=" * 56 + "\n")

        return {
            "status": "success",
            "vlm_result": parsed
        }
    except Exception as e:
        print("[Inspection Error] 詳細錯誤如下：")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))