import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ChatAiService } from '../../services/chat-ai.service';

type ChatMessage = { text: string; isUser: boolean };

@Component({
  selector: 'app-chat-widget',
  templateUrl: './chat-widget.component.html',
  styleUrls: ['./chat-widget.component.css']
})
export class ChatWidgetComponent implements OnInit {
  isOpen = false;
  userMessage = '';
  isLoading = false;

  messages: ChatMessage[] = [
    { text: 'Xin chào! Tôi là trợ lý ảo Shopee. Tôi có thể giúp gì cho bạn?', isUser: false }
  ];

  @ViewChild('chatBody') chatBody!: ElementRef<HTMLDivElement>;
  @ViewChild('bottomAnchor') bottomAnchor!: ElementRef<HTMLDivElement>;

  constructor(private chatService: ChatAiService) { }

  ngOnInit(): void { }

  toggleChat() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) this.scrollToBottom();
  }

  sendMessage() {
    const msg = (this.userMessage || '').trim();
    if (!msg || this.isLoading) return;

    // user message
    this.messages.push({ text: msg, isUser: true });
    this.userMessage = '';
    this.isLoading = true;
    this.scrollToBottom();

    this.chatService.sendMessage(msg).subscribe(
      (response: any) => {
        this.isLoading = false;

        // ✅ chịu được nhiều dạng response backend trả về
        let botText = '';
        if (typeof response === 'string') {
          botText = response;
        } else if (response && typeof response === 'object') {
          botText = response.response || response.reply || response.text || '';
        }

        if (!botText || !botText.trim()) {
          botText = 'Mình chưa nhận được nội dung trả lời. Bạn thử lại giúp mình nhé!';
        }

        this.messages.push({ text: botText, isUser: false });
        this.scrollToBottom();
      },
      (error) => {
        this.isLoading = false;
        this.messages.push({ text: 'Lỗi kết nối tới Server!', isUser: false });
        this.scrollToBottom();
        console.error(error);
      }
    );
  }

  private scrollToBottom() {
    // delay để Angular render xong DOM rồi mới scroll
    setTimeout(() => {
      try {
        if (this.bottomAnchor?.nativeElement) {
          this.bottomAnchor.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else if (this.chatBody?.nativeElement) {
          this.chatBody.nativeElement.scrollTop = this.chatBody.nativeElement.scrollHeight;
        }
      } catch (e) {
        // ignore
      }
    }, 0);
  }
}
