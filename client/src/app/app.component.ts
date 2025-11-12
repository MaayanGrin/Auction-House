import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SocketService } from './services/socket.service';
import { NotificationService } from './services/notification.service';
import { NotificationsComponent } from './shared/notifications/notifications.component';
import { Subscription } from 'rxjs';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [RouterOutlet, NotificationsComponent]
})
export class AppComponent implements OnInit, OnDestroy {
  private socket = inject(SocketService);
  private notificationService = inject(NotificationService);
  private subscriptions: Subscription[] = [];

  ngOnInit() {
    const username = localStorage.getItem('username');
    if (username) {
      this.socket.connect(username);
      this.setupGlobalNotifications();
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private setupGlobalNotifications() {
    const outbidSub = this.socket.onOutbidNotification().subscribe((notification: any) => {
      const currentUsername = localStorage.getItem('username');
      
      if (notification.outbidUser === currentUsername) {
        this.notificationService.showNotification(
          'warning',
          'You Were Outbid!',
          `${notification.newBidder} outbid you on "${notification.auctionTitle}" with $${notification.newBidAmount}`,
          8000
        );
        
      }
    });

    this.subscriptions.push(outbidSub);
  }

 
}
