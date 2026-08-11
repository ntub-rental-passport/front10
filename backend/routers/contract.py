from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
import requests
import os
import json
import traceback

from database import get_db
import models

router = APIRouter(
    prefix="/api/contract",
    tags=["AI 租屋合約智慧審查與 RAG 分析"]
)

# ========================================================
# 📦 Pydantic 資料模型 (對齊前端分析頁面 request/response)
# ========================================================

class AnalyzeRequest(BaseModel):
    ocr_text: str
    page_texts: Optional[List[str]] = []
    field_reviews: Optional[Dict[str, Any]] = {}

class ChatRequest(BaseModel):
    message: str
    contract_text: Optional[str] = ""
    active_risk: Optional[Dict[str, Any]] = None


# ========================================================
# 🔍 1. RAG 風險比對與 AI 診斷端點
# ========================================================
@router.post("/analyze")
async def analyze_contract(req: AnalyzeRequest):
    """
    接收前端 Express OCR 產出的合約文字，進行 RAG 法規/判決比對與 LLM 風險分析
    """
    try:
        ocr_text = req.ocr_text.strip()
        if not ocr_text:
            return {"rag_risks": [], "ai_risks": []}

        # ----------------------------------------------------
        # 🔹 步驟 A：RAG 法規與裁判書比對 ( Context )
        # ----------------------------------------------------
        rag_context = (
            "【住宅租賃定型化契約應記載及不得記載事項】\n"
            "1. 押金最高不得超過兩個月租金。\n"
            "2. 出租人應負修繕責任，不得改由承租人概括負擔。\n"
            "3. 房屋稅與地價稅由出租人負擔。\n"
            "4. 提前終止租約之違約金最高不得超過一個月租金。"
        )

        # ----------------------------------------------------
        # 🔹 步驟 B：呼叫 LLM (Ollama / Gemini) 生成結構化風險卡片
        # ----------------------------------------------------
        prompt = f"""你是一名專業的台灣租賃法律專家。請分析以下【租賃合約文字】，比對【相關法規】：
【相關法規 Context】:
{rag_context}

【租賃合約文字】:
{ocr_text}

請列出此合約中的法規風險 (rag) 與 AI 綜合建議 (ai)。
必須「嚴格」回傳標準的 JSON 格式，不要包含任何 markdown 標記或其他文字：
{{
  "rag_risks": [
    {{
      "id": "rag-1",
      "title": "風險簡短標題",
      "severity": "high",
      "source": "rag",
      "sourceLabel": "RAG 法規比對",
      "groupId": null,
      "groupLabel": "修繕與保養",
      "fieldIds": [],
      "pageIndex": 0,
      "focusText": "觸發的關鍵字",
      "clause": "合約原文段落",
      "description": "風險說明",
      "advice": "給租客的談判或修改建議",
      "legalBasis": ["民法第 429 條", "住宅租賃定型化契約應記載事項第 9 點"]
    }}
  ],
  "ai_risks": [
    {{
      "id": "ai-1",
      "title": "AI 建議標題",
      "severity": "medium",
      "source": "ai",
      "sourceLabel": "AI 語意分析",
      "groupId": null,
      "groupLabel": "條款明確度",
      "fieldIds": [],
      "pageIndex": 0,
      "focusText": "關鍵字",
      "clause": "合約原文段落",
      "description": "說明",
      "advice": "建議",
      "legalBasis": []
    }}
  ]
}}
"""

        rag_risks = []
        ai_risks = []

        try:
            print("🧠 [AI 核心] 正發送 Prompt 至地端 Ollama (gemma3:4b)，將無限制等待至推論完成...")
            
            ollama_res = requests.post(
                "http://127.0.0.1:11434/api/generate",
                json={
                    "model": "gemma3:4b",
                    "prompt": prompt,
                    "format": "json",  # 強制輸出 JSON 格式
                    "stream": False
                },
                timeout=None
            )

            res_data = ollama_res.json()
            raw_response = res_data.get("response", "").strip()
            print(f"📩 [AI 核心] 成功接收到 Ollama 原始回應！(字數: {len(raw_response)})")

            if not raw_response:
                raise ValueError("Ollama 回傳了空字串")

            # 💡 1. 抓出第一個 '{' 到最後一個 '}'
            import re
            json_match = re.search(r'\{[\s\S]*\}', raw_response)
            if not json_match:
                raise ValueError("回應中找不到有效的 JSON 結構")

            cleaned_json = json_match.group(0)
            parsed = json.loads(cleaned_json)
            
            # 💡 2. 容錯處理：相容 snake_case (rag_risks) 與 camelCase (ragRisks)
            rag_risks = parsed.get("rag_risks") or parsed.get("ragRisks") or []
            ai_risks = parsed.get("ai_risks") or parsed.get("aiRisks") or []

            # 💡 3. 若模型直接把陣列放在根目錄或不同 Key
            if not rag_risks and not ai_risks and isinstance(parsed, dict):
                # 嘗試尋找任何包含 risk 關鍵字的 key
                for k, v in parsed.items():
                    if "rag" in k.lower() and isinstance(v, list):
                        rag_risks = v
                    elif "ai" in k.lower() and isinstance(v, list):
                        ai_risks = v

            print(f"✅ [AI 核心] LLM JSON 解析成功！產出 {len(rag_risks)} 項 RAG 風險與 {len(ai_risks)} 項 AI 建議。")

        except Exception as err:
            print(f"❌ [解析失敗除錯] 原因: {err}")
            if 'raw_response' in locals():
                print("---------------- 🔍 Ollama 原始回傳 300 字預覽 ----------------")
                print(raw_response[:300])
                print("---------------------------------------------------------------")
            print("⚠️ 退回後端預設 RAG 比對結果。")
            if "承租人負責" in ocr_text or "修繕" in ocr_text:
                rag_risks.append({
                    "id": "rag-fallback-1",
                    "title": "設備修繕責任概括轉嫁承租人",
                    "severity": "high",
                    "source": "rag",
                    "sourceLabel": "RAG 法規比對",
                    "groupId": None,
                    "groupLabel": "修繕與保養",
                    "fieldIds": [],
                    "pageIndex": 0,
                    "focusText": "修繕",
                    "clause": "房屋及其附屬設備之修繕概由承租人負責。",
                    "description": "依據民法及住宅租賃專法，租賃物自然耗損之修繕責任原則上在出租人。",
                    "advice": "建議請房東修改條文，註明「非可歸責於承租人之故意過失，由出租人負責修繕」。",
                    "legalBasis": ["民法第 429 條", "住宅租賃定型化契約應記載事項第 9 點"]
                })

            ai_risks.append({
                "id": "ai-fallback-1",
                "title": "提前終止租約與通知流程可再明確",
                "severity": "low",
                "source": "ai",
                "sourceLabel": "AI 語意分析",
                "groupId": None,
                "groupLabel": "提前終止",
                "fieldIds": [],
                "pageIndex": 0,
                "focusText": "終止",
                "clause": "雙方如欲提前終止租約，應告知對方。",
                "description": "約定內容缺少具體通知期限（如至少提前一個月）及違約金約定。",
                "advice": "建議補充提前通知天數及違約金上限（不超過一個月租金）。",
                "legalBasis": ["住宅租賃定型化契約應記載事項第 14 點"]
            })

        return {
            "rag_risks": rag_risks,
            "ai_risks": ai_risks
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ========================================================
# 💬 2. AI 談判腳本對話端點 (Law Chat)
# ========================================================
@router.post("/chat")
async def contract_chat(req: ChatRequest):
    """
    提供前端 Law Chat 對話框即時回應，依據合約脈絡生成溫和、法律導向的溝通訊息
    """
    try:
        user_msg = req.message
        active_risk = req.active_risk

        risk_context = ""
        if active_risk and isinstance(active_risk, dict):
            title = active_risk.get('title', '')
            clause = active_risk.get('clause', '')
            advice = active_risk.get('advice', '')
            risk_context = f"目前討論的風險標的：{title}。合約條文：{clause}。法規建議：{advice}"

        prompt = f"""你是租客的法律顧問。請幫租客寫一段發給房東的 LINE 或 Email 訊息。
訴求：{user_msg}
{risk_context}

語氣要求：禮貌、溫和但堅定，並適度引用法律依據。回答控制在 150 字以內。
"""

        try:
            print("💬 [Law Chat] 發送對話 Prompt 至 Ollama...")
            ollama_res = requests.post(
                "http://127.0.0.1:11434/api/generate",
                json={"model": "gemma3:4b", "prompt": prompt, "stream": False},
                timeout=None  # 💡 設為 None，讓聊天對話也跑到底
            )
            reply = ollama_res.json().get("response", "").strip()
            print("✅ [Law Chat] 回覆生成完成！")
        except Exception as err:
            print(f"⚠️ Law Chat 呼叫失敗，原因: {err}")
            reply = f"房東您好：關於「{user_msg}」，建議參考住宅租賃定型化契約規範，雙方能在簽約前補齊相關細節，以確保雙方權益。謝謝您！"

        return {
            "reply": reply,
            "sources": ["住宅租賃定型化契約應記載事項", "契約原文對比"]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))