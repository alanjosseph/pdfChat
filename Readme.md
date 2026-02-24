# DocumentAI – PDF Chat with AI (RAG + Citations)

DocumentAI is a production-oriented, full-stack web application that lets users **upload PDF documents** and **chat with them using AI-powered question answering**. The system ingests PDFs in the background, extracts text (and tables), generates vector embeddings with **AWS Bedrock**, stores them in **PostgreSQL + pgvector**, and serves **contextual answers with citations** that link directly to the referenced PDF page in the viewer.

> **Portfolio note (for recruiters):** 

This project demonstrates end-to-end engineering of a modern Retrieval-Augmented Generation (RAG) application — secure uploads, background processing, semantic search, LLM orchestration, and CI/CD deployment on AWS.

## Login ID

- Username: user1
- Password: useronepassword@123

---

## 🔥 Highlights

- **Secure upload pipeline** with **S3 pre-signed URLs** (no file data passes through the API server).
- **Background ingestion worker** processes PDFs asynchronously (scales horizontally).
- **Vector search** using **pgvector** with similarity indexing (HNSW).
- **AI chat grounded in document content** (RAG) with **page-linked citations**.
- **Multi-document UX** with document selection + separate chat sessions per document.
- **Dockerized microservice setup** + **Nginx reverse proxy**.
- **CI/CD via GitHub Actions** with separate **staging** and **production** deployments.

---

## 🧠 How it Works (RAG Flow)

1. **User uploads PDF**
2. Backend returns **S3 pre-signed upload URL**
3. Frontend uploads directly to **S3**
4. **Ingestion worker**:
   - extracts text (and tables)
   - chunks content
   - generates embeddings using **Bedrock Embeddings**
   - stores vectors in **pgvector**
5. **Chat request**:
   - embed query
   - perform vector similarity search in pgvector
   - retrieve top-K chunks
   - Bedrock LLM generates answer **with citations**
6. **UI** displays answer + clickable citation chips → **jumps to cited PDF page**

---

## ✅ Features

- JWT-based authentication
- Secure PDF upload via S3 pre-signed URLs
- Background ingestion worker
- Text chunking + embeddings (pgvector)
- Semantic search over document content
- AI-powered chat with citations
- Clickable citations that navigate to PDF pages
- Dockerized microservice architecture
- Staging + Production deployments (branch-based)
- CI/CD via GitHub Actions

---

## 🧱 Tech Stack

### Backend
- NestJS
- Prisma ORM
- PostgreSQL + pgvector
- AWS S3 (file storage)
- AWS Bedrock (embeddings + chat)
- Docker

### Frontend
- React + TypeScript
- React-PDF (document viewer)
- JWT authentication

### Infrastructure
- EC2
- Nginx (reverse proxy)
- Docker Compose
- GitHub Actions CI/CD pipeline

---

## 🗂️ Project Structure

documentai/
│
├── api/ # NestJS backend
│ ├── prisma/ # Prisma schema & migrations
│ ├── src/
│
├── web/ # React frontend (Vite)
│ ├── src/
│
├── docker-compose.yml
├── .github/workflows/ # CI/CD pipelines
└── README.md

## Future Improvements

- Persistent chat history UI (load prior sessions per document)
- Multi-document chat mode
- Horizontal scaling with multiple worker