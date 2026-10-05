# Backend TikTok affiliate cho một người vận hành

## Mục đích

Chuẩn bị và quản lý sản phẩm affiliate, kịch bản video, các video đã đăng và hoa hồng thực tế. Dữ liệu trong MongoDB là sổ theo dõi cá nhân; TikTok Shop Creator Center vẫn là nguồn chính thức của quyền gắn sản phẩm, đơn hàng và hoa hồng.

Tài khoản cần quyền TikTok Shop for Creator. Đăng video và gắn sản phẩm bằng tính năng của TikTok. Backend chưa có quyền Content Posting API và không tự đăng, không gắn giỏ hàng thay tài khoản của bạn.

## API chính

| API | Mục đích |
|---|---|
| `GET /api/v1/products` | Xem sản phẩm đã lưu |
| `POST /api/v1/products` | Nhập sản phẩm thật, `sourceUrl` và tùy chọn `affiliateUrl` |
| `PATCH /api/v1/products/:id` | Cập nhật link affiliate Creator, giá và xác nhận `affiliateStatus: READY` |
| `POST /api/v1/affiliate/videos` | Tạo nháp kịch bản và shot list từ dữ kiện sản phẩm |
| `GET /api/v1/affiliate/videos` | Xem nháp và video đã đăng |
| `PATCH /api/v1/affiliate/videos/:id` | Sửa nháp |
| `PATCH /api/v1/affiliate/videos/:id/approve` | Duyệt kịch bản trước khi quay/đăng |
| `PATCH /api/v1/affiliate/videos/:id/posted` | Ghi URL video đã đăng sau khi xác nhận đã gắn sản phẩm trong TikTok |
| `PATCH /api/v1/affiliate/videos/:id/metrics` | Nhập số liệu video từ Creator Center |
| `POST /api/v1/affiliate/commissions` | Ghi hoặc cập nhật một dòng hoa hồng đã đối chiếu theo `orderId + sku` |
| `GET /api/v1/affiliate/commissions` | Xem hoa hồng theo trạng thái |
| `GET /api/v1/affiliate/summary` | Tổng số sản phẩm, video, click ngoài app và hoa hồng đã quyết toán |
| `GET /api/v1/affiliate/products/performance` | So sánh lượt xem đã nhập và hoa hồng đã quyết toán theo SKU |
| `POST /api/v1/affiliate/links` | Tạo link chuyển tiếp riêng cho kênh ngoài TikTok |
| `GET /api/v1/affiliate/links` | Xem link ngoài TikTok |
| `GET /api/v1/go/:code` | Ghi click rồi chuyển tới affiliate URL đã lưu |

Các endpoint ghi và endpoint xem hoa hồng yêu cầu header `x-review-secret` bằng `ADMIN_REVIEW_SECRET` trong `.env`. Không đưa secret vào Git, ảnh chụp màn hình hoặc tin nhắn. API `GET /products` và `/go` là công khai trên VM; đừng mở cổng 80/5678 lên Internet trước khi có HTTPS và kiểm soát truy cập phù hợp.

## Thứ tự dùng thật

1. Từ tài khoản Creator, chọn sản phẩm mà bạn có quyền quảng bá, lấy **link affiliate do TikTok tạo**. Link xem sản phẩm thường không tương đương link affiliate.
2. Nhập hoặc cập nhật sản phẩm: SKU, tên, giá tại thời điểm kiểm tra, URL nguồn và affiliate URL. Đối chiếu xong mới đặt `affiliateStatus = READY`.
3. Tạo nháp video, kiểm tra sản phẩm thật và sửa mọi câu chưa xác thực. Backend chỉ tạo kịch bản và shot list, chưa tạo tệp MP4.
4. Duyệt; tự quay/biên tập video và đăng trong TikTok, gắn sản phẩm bằng giao diện TikTok. Sau khi kiểm tra link sản phẩm hiển thị trên video, nhập URL video vào backend.
5. Lấy lượt xem/click sản phẩm và hoa hồng từ Creator Center để nhập vào backend. `PENDING` không cộng vào khoản tiền đã được quyết toán; chỉ `SETTLED` được tính trong `settledCommissionVnd`.

## Ví dụ JSON

Cập nhật sản phẩm đã có:

```json
{
  "affiliateUrl": "https://vt.tiktok.com/LINK-AFFILIATE-DO-CREATOR-TAO/",
  "affiliateStatus": "READY",
  "estimatedCommissionRatePct": 8
}
```

Tạo nháp: `POST /api/v1/affiliate/videos`:

```json
{"productId":"ID_SAN_PHAM_TRONG_MONGODB","angle":"phối áo sơ mi đi học"}
```

Sau khi đăng: `PATCH /api/v1/affiliate/videos/:id/posted`:

```json
{"tiktokVideoUrl":"https://www.tiktok.com/@ban/video/ID_THAT","linkedProductConfirmed":true}
```

Ghi hoa hồng đã đối chiếu: `POST /api/v1/affiliate/commissions`:

```json
{"orderId":"MA_DON_TREN_CREATOR_CENTER","sku":"TIKTOK-ZUTEE-SOMI-001","commissionVnd":20000,"status":"PENDING"}
```

Cùng `orderId + sku` gửi lại với `status: SETTLED` sẽ cập nhật dòng đó, không tạo một dòng thứ hai.

## Ý nghĩa số liệu

`externalClicks` chỉ đếm click qua `/go`, dùng khi bạn chia sẻ link affiliate **ngoài TikTok**. Nó không phải số lượt xem hay click giỏ hàng trong video TikTok. Hoa hồng và quy thuộc đơn hàng lấy từ Creator Center; backend không thể suy ra đơn hàng từ click của chính nó.
