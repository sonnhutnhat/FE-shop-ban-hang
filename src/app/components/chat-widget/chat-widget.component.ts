import { Component, OnInit } from '@angular/core';
import { ChatAiService } from '../../services/chat-ai.service'; // Import Service vừa tạo

@Component({
  selector: 'app-chat-widget',
  templateUrl: './chat-widget.component.html',
  styleUrls: ['./chat-widget.component.css']
})
export class ChatWidgetComponent implements OnInit {
  isOpen = false;       // Trạng thái mở/đóng khung chat
  userMessage = '';     // Nội dung người dùng nhập
  isLoading = false;    // Trạng thái đang chờ AI trả lời

  // Danh sách tin nhắn (Mẫu 1 tin chào hỏi ban đầu)
  messages: { text: string, isUser: boolean }[] = [
    { text: 'Xin chào! Tôi là trợ lý ảo Martfury. Tôi có thể giúp gì cho bạn?', isUser: false }
  ];

  constructor(private chatService: ChatAiService) { }

  ngOnInit(): void {
  }

  // Hàm bật/tắt khung chat
  toggleChat() {
    this.isOpen = !this.isOpen;
  }

  // Hàm gửi tin nhắn
  sendMessage() {
    if (!this.userMessage.trim()) return;

    // 1. Hiển thị tin nhắn của người dùng ngay lập tức
    const msg = this.userMessage;
    this.messages.push({ text: msg, isUser: true });
    this.userMessage = ''; // Xóa ô nhập
    this.isLoading = true; // Bật loading

    // 2. Gửi xuống Backend
    this.chatService.sendMessage(msg).subscribe(
      (response) => {
        this.isLoading = false;
        // 3. Nhận câu trả lời từ AI và hiển thị
        // Backend trả về: { "response": "Nội dung..." }
        this.messages.push({ text: response.response, isUser: false });
      },
      (error) => {
        this.isLoading = false;
        this.messages.push({ text: 'Lỗi kết nối tới Server!', isUser: false });
        console.error(error);
      }
    );
  }
}