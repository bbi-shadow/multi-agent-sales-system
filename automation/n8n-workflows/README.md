# n8n workflows

Các workflow JSON sẽ được bổ sung theo thứ tự: lead research, lead scoring, content generation, approval, email, CRM, analytics và video. Không đặt credential trực tiếp trong file workflow.

## Bản nháp 30 giây

Import `tiktok-script-and-preview.json` vào n8n, gắn Header Auth `x-workflow-secret` cho bốn node HTTP. Mỗi video gọi Veo bốn lần, ghép bằng ffmpeg thành MP4 30 giây; chi phí có thể phát sinh. Hệ thống chưa tự đồng bộ TikTok Creator hoặc đăng video gắn sản phẩm.
