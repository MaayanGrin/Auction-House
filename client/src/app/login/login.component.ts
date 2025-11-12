import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SocketService } from '../services/socket.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class LoginComponent implements OnInit {
  private router = inject(Router);
  private socketService = inject(SocketService);
  
  username = '';
  isUserLoggingIn = false;

  ngOnInit() {
       const existUsername = localStorage.getItem('username');
    
    if (existUsername) {

      this.isUserLoggingIn = true;
      this.username = existUsername;
      
      this.socketService.connect(existUsername);
      
   setTimeout(() => {
        if (this.isUserLoggingIn) {
          this.router.navigate(['/auctions']);
        }
      }, 500);
    }
  }


  login() {

    if (this.isUserLoggingIn) {
      return;
    }

    localStorage.setItem('username', this.username);
    this.socketService.connect(this.username);
        this.router.navigate(['/auctions']);
  }

    logout() {
    this.isUserLoggingIn = false;
    this.username = '';
    localStorage.removeItem('username');
    this.socketService.disconnect();
  }
}