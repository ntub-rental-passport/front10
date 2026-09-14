import os
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import MarkdownHeaderTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma

# 1. 定義要處理的檔案清單
target_files = [
    "住宅租賃定型化契約應記載及不得記載事項_完整規則版.md",
    "租賃住宅市場發展及管理條例_完整條文版.md",
    "住宅租賃契約書範本_完整結構版.md"
]

# 2. 定義切分邏輯 (確保法律條文的完整性)
headers_to_split_on = [
    ("#", "Header 1"),   # 章節
    ("##", "Header 2"),  # 條次
    ("###", "Header 3"), # 細項
]
markdown_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers_to_split_on)

all_documents = []

for file_name in target_files:
    if os.path.exists(file_name):
        print(f"正在讀取檔案：{file_name}")
        with open(file_name, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 進行結構化切分
        splits = markdown_splitter.split_text(content)
        
        # 在 Metadata 中加入來源，方便 AI 之後引用法源
        for s in splits:
            s.metadata["source_file"] = file_name
        
        all_documents.extend(splits)

print(f"切分完成，共產生 {len(all_documents)} 個知識區塊。")

# 3. 初始化「本地」Embedding 模型 (不需要 API Key)
print("正在載入本地 Embedding 模型 (shibing624/text2vec-base-chinese)...")
# 註：這會使用你的 CPU 或 GPU (1060) 進行運算
embeddings = HuggingFaceEmbeddings(model_name="shibing624/text2vec-base-chinese")

# 4. 建立 ChromaDB 並存儲至本地資料夾
db_path = "./rental_law_db"
print("正在建立向量資料庫，這可能需要一點時間...")

vector_db = Chroma.from_documents(
    documents=all_documents,
    embedding=embeddings,
    persist_directory=db_path
)

print(f"✅ 成功！本地向量資料庫已儲存於：{db_path}")