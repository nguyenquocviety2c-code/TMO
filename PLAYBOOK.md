# Playbook — Kinh nghiệm & Quy tắc rút ra

> File này lưu trữ các bài học kinh nghiệm mà Agent rút ra sau mỗi task.
> Agent sẽ đọc file này trước khi làm task mới để tránh lặp lại lỗi cũ.


Can't initialize prompt toolkit: Found xterm-256color, while expecting a 
Windows console. Maybe try to run this program using "winpty" or run it in 
cmd.exe instead. Or otherwise, in case of Cygwin, use the Python executable 
that is compiled for Cygwin.
───────────────────────────────────────────────────────────────────────────────
You can skip this check with --no-gitignore
Added .env to .gitignore
Aider v0.86.2
Model: openai/z-ai/glm-5.2 with diff edit format
Git repo: .git with 725 files
Repo-map: disabled
Added CONVENTIONS.md to the chat (read-only).
Added MEMORY.md to the chat (read-only).

[API DELETE Endpoint - Xóa Agent]                                              

 • Quy tắc: Khi tạo API DELETE (như /api/agents/[id]), luôn bọc logic trong    
   try-catch, kiểm tra sự tồn tại của bản ghi trước khi xóa, và trả về response
   format chuẩn { ok: boolean, data?: any, error?: string } với HTTP status    
   code phù hợp (200/204 khi thành công, 404 nếu không tìm thấy, 500 khi lỗi   
   server).                                                                    
 • Lý do: Giúp API an toàn, dễ debug, tránh crash server khi Prisma query lỗi  
   (ví dụ: P2025 - Record not found), và đảm bảo frontend nhận được phản hồi   
   nhất quán để xử lý UI đúng cách.                                            

Tokens: 9.4k sent, 160 received.
