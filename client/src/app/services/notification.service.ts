import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface NotificationMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  timestamp: Date;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {

  private notifications$ = new BehaviorSubject<NotificationMessage[]>([]);
  private notificationCounter = 0;

  getNotifications() {
    return this.notifications$.asObservable();
  }

  showNotification(type: 'success' | 'error' | 'warning' | 'info',title: string,message: string,duration: number = 5000) {
    const notification: NotificationMessage = {
      id: `notification-${++this.notificationCounter}`,
      type,
      title,
      message,
      duration,
      timestamp: new Date()
    };

    const currentNotifications = this.notifications$.value;
    this.notifications$.next([...currentNotifications, notification]);

    if (duration > 0) {
      setTimeout(() => {
        this.removeNotification(notification.id);
      }, duration);
    }

    return notification.id;
  }

  removeNotification(id: string) {
    const currentNotifications = this.notifications$.value;
    const updatedNotifications = currentNotifications.filter(n => n.id !== id);
    this.notifications$.next(updatedNotifications);
  }

  clearNotificationsByPattern(titlePattern: string) {
    const currentNotifications = this.notifications$.value;
    const updatedNotifications = currentNotifications.filter(n => 
      !n.title.includes(titlePattern)
    );
    this.notifications$.next(updatedNotifications);
  }


  clearConnectionNotifications() {
    this.clearNotificationsByPattern('Connected');
    this.clearNotificationsByPattern('Connection');
    this.clearNotificationsByPattern('Reconnect');
  }

  clearAllNotifications() {
    this.notifications$.next([]);
  }

  showSuccess(title: string, message: string, duration?: number) {
    return this.showNotification('success', title, message, duration);
  }

  showError(title: string, message: string, duration?: number) {
    return this.showNotification('error', title, message, duration);
  }

  showWarning(title: string, message: string, duration?: number) {
    return this.showNotification('warning', title, message, duration);
  }

  showInfo(title: string, message: string, duration?: number) {
    return this.showNotification('info', title, message, duration);
  }

  showAuctionCreated(auctionTitle: string, createdBy: string) {
    return this.showSuccess('New Auction Created!',`"${auctionTitle}" was created by ${createdBy}`,
      6000);
  }

  showAuctionUpdated(auctionTitle: string, updateType: string) {
    return this.showInfo('Auction Updated',`"${auctionTitle}" - ${updateType}`,
      4000
    );
  }

  showNewBid(auctionTitle: string, bidder: string, amount: number, currency: string = 'USD') {
    return this.showInfo('New Bid Placed!',
      `${bidder} bid $${amount} on "${auctionTitle}"`,
      4000
    );
  }

  showAuctionExtended(auctionTitle: string) {
    return this.showWarning('Auction Extended!',`"${auctionTitle}" was extended due to last-minute bidding`,
      5000
    );
  }

  showAuctionStatusChange(auctionTitle: string, newStatus: string) {
    let title = '';
    let message = '';
    let type: 'success' | 'info' | 'warning' = 'info';

    switch (newStatus) {
      case 'active':
        title = 'Auction Started!';
        message = `"${auctionTitle}" is now accepting bids`;
        type = 'success';
        break;
      case 'ended':
        title = 'Auction Ended';
        message = `"${auctionTitle}" has concluded`;
        type = 'info';
        break;
      default:
        title = 'Auction Status Changed';
        message = `"${auctionTitle}" is now ${newStatus}`;
        break;
    }

    return this.showNotification(type, title, message, 5000);
  }

  showOutbidNotification(auctionTitle: string, newBidder: string, amount: number) {
    return this.showWarning(
      'You Were Outbid!',
      `${newBidder} outbid you on "${auctionTitle}" with $${amount}`,
      7000
    );
  }
}