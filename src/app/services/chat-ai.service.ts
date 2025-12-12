import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ChatAiService {
  // Đường dẫn đến API Backend của bạn
  private apiUrl = 'http://localhost:8080/api/chat';

  constructor(private http: HttpClient) { }

  sendMessage(message: string): Observable<any> {
    // Gửi body JSON { "message": "..." } giống như lúc test Postman
    return this.http.post<any>(this.apiUrl, { message: message });
  }
}