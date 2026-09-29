# SalesMind AI — Multi-Agent Sales System

Bản nền móng MVP sử dụng Next.js, NestJS, MongoDB, n8n, Nginx và Docker Compose.

## Yêu cầu

- Ubuntu 24.04
- Docker Engine
- Docker Compose
- Tối thiểu 4 GB RAM và khuyến nghị 15 GB dung lượng trống

## Khởi chạy

```bash
cp .env.example .env
nano .env
docker compose up -d --build
docker compose ps
```

Truy cập:

- Giao diện: `http://localhost`
- Swagger API: `http://localhost/api/docs`
- Health API: `http://localhost/api/v1/health`
- n8n: `http://localhost:5678`

## Kiểm tra API lead

```bash
curl -X POST http://localhost/api/v1/leads \
  -H 'Content-Type: application/json' \
  -d '{"fullName":"Nguyen Van A","email":"a@example.com","company":"ABC","industry":"E-commerce","consentStatus":"GRANTED"}'
```

```bash
curl http://localhost/api/v1/leads
```

## Dừng hệ thống

```bash
docker compose down
```

Không chạy `docker compose down -v` nếu muốn giữ dữ liệu MongoDB và n8n.

## Trạng thái hiện tại

- Hoàn thành nền tảng Docker Compose.
- Hoàn thành MongoDB persistent volume.
- Hoàn thành API health và API tạo/xem lead.
- Hoàn thành dashboard khởi đầu.
- Đã chuẩn bị thư mục workflow n8n và media.
- Chưa có Authentication, các module nghiệp vụ còn lại và workflow AI; đây là các bước phát triển kế tiếp.
