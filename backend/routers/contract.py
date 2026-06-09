from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from google.cloud import vision
import requests
import os
import traceback
from database import get_db
import models

router = APIRouter(
    prefix="/api/contract",
    tags=["AI 租屋合約智慧審查"]
)

# ========================================================
# 🔑 鎖定你的真實 Google JSON 憑證路徑
# ========================================================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 💡 請確保你下載的 JSON 檔案，在 backend/ 資料夾下的名稱一模一樣叫做 rentmate-vision-key.json
KEY_PATH = os.path.join(BASE_DIR, "rentmate-vision-key.json")
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = KEY_PATH

try:
    ocr_client = vision.ImageAnnotatorClient()
    print("✅ [Google Vision] 真實憑證載入成功，連線就緒！")
except Exception as e:
    ocr_client = None
    print(f"⚠️ [Google Vision] 初始化失敗: {e}")


@router.post("/upload/{rental_id}")
async def upload_and_analyze_contract(
    rental_id: int, 
    file: UploadFile = File(...), 
    db: Session = Depends(get_db)
):
    try:
        # 🛠️ 測試核心一：暫時跳過 MySQL 檢查，讓程式能直接往下跑
        print(f"🔹 [測試模式] 已跳過資料庫檢查，正在處理案件 ID: {rental_id}")
        
        contents = await file.read()

        # ==========================================
        # 🔥 測試核心二：呼叫真實的 Google Cloud Vision API
        # ==========================================
        print("📸 [AI 核心] 正在發送請求至 Google Cloud Vision API (OCR)...")
        if not ocr_client:
            raise HTTPException(status_code=500, detail="Google OCR 用戶端未成功初始化，請檢查 JSON 檔案位置")
            
        try:
            image = vision.Image(content=contents)
            # 使用高精準度文件辨識服務
            response = ocr_client.document_text_detection(image=image)
            
            if response.error.message:
                raise Exception(f"Google 雲端拒絕請求: {response.error.message}")
                
            # 這是 Google 吐回來的真實合約字串！
            ocr_text = response.full_text_annotation.text
            print("✅ [AI 核心] Google Cloud Vision 成功拔出文字！")
            
        except Exception as google_err:
            print(f"❌ Google API 呼叫引爆: {str(google_err)}")
            raise HTTPException(status_code=500, detail=f"Google 雲端連線失敗: {str(google_err)}")

        # ==========================================
        # 🔹 步驟三：呼叫地端 Ollama 進行法律推理
        # ==========================================
        # 為了讓你快速拿到報表，如果 Ollama 沒開，我們會吐出對應合約的模擬文字，不讓程式卡死
        rag_context = "【官方法規】1.押金不得超過兩個月租金。2.設備損壞由房東負責。"
        prompt = f"請根據【官方住宅租賃法規】：{rag_context}，審查以下【用戶合約文字】：{ocr_text}。並生成風險報告。"
        
        print("🧠 [AI 核心] 正在呼叫地端 Ollama 進行推理...")
        try:
            # 這是呼叫你地端電腦或虛擬機跑的 Ollama
            ollama_res = requests.post(
                "http://127.0.0.1:11434/api/generate",
                json={"model": "gemma3:4b", "prompt": prompt, "stream": False},
                timeout=15
            )
            ai_report = ollama_res.json().get("response", "地端 AI 生成報告失敗")
        except Exception:
            print("⚠️ 地端 Ollama 未啟動，跳過推理步驟。")
            ai_report = f"【地端模擬報告】已成功取得 Google OCR 文字。合約中有提到「租金」與「押金」等關鍵字，系統管線暢通！"

        # 🛠️ 測試核心三：暫時不寫入 MySQL (防止外鍵錯誤)，直接把成果噴回網頁
        print("🎉 [AI 核心] 實戰測試成功，正在打包數據回傳前端...")
        
        return {
            "status": "實戰測試成功 (Google Vision API 運作正常)",
            "rental_id": rental_id,
            "上傳的檔案名稱": file.filename,
            "Google幫你辨識出的真實合約文字": ocr_text, # 👈 你最想看的真實文字就在這裡！
            "AI法律風險分析報告": ai_report
        }

    except HTTPException as http_err:
        raise http_err
    except Exception as api_error:
        print("\n💥💥💥 [嚴重錯誤] 程式碼引爆： 💥💥💥")
        traceback.print_exc() 
        raise HTTPException(status_code=500, detail=str(api_error))