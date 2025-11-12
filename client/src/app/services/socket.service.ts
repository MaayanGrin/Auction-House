import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;
  private base = environment.socketUrl;
  private currentUsername?: string;
  
  private auctionUpdate$ = new Subject<any>();
  private auctionTick$ = new Subject<any>();
  private auctionStatusChange$ = new Subject<any>();
  private bidUpdate$ = new Subject<any>();
  private outbidNotification$ = new Subject<any>();
  private globalUpdate$ = new Subject<any>();
  

  private activeAuctionSubscriptions = new Set<string>();
  private connectionStatus$ = new BehaviorSubject<'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  
  private reconnectAttempts = 0;
  private wasConnectedBefore = false;
  private lastDisconnectTime?: Date;

  constructor(private notificationService: NotificationService) {}

  connect(username: string) {
    if (this.socket?.connected) {
      this.disconnect();
    }

    this.currentUsername = username;
    
    this.socket = io(this.base, { 
      auth: { username },
      transports: ['websocket', 'polling'],
      reconnection: true,                    
      reconnectionAttempts: Infinity,        
      reconnectionDelay: 1000,               
      reconnectionDelayMax: 5000,            
      randomizationFactor: 0.5,              
      timeout: 20000,
      forceNew: true
    });

    this.setupReconnectionHandlers();
    this.setupEventListeners();
  }


  private setupReconnectionHandlers() {
    if (!this.socket) return;


    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.connectionStatus$.next('connected');
      this.reconnectAttempts = 0;
      
      
      this.notificationService.clearConnectionNotifications();
      
      this.wasConnectedBefore = true;
      this.lastDisconnectTime = undefined;
      
      console.log('Auto-resubscribing to active auctions:', Array.from(this.activeAuctionSubscriptions));
      this.resubscribeToActiveAuctions();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
      this.connectionStatus$.next('disconnected');
      this.lastDisconnectTime = new Date();
      
      this.wasConnectedBefore = true;
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`Reconnection attempt #${attemptNumber}`);
      this.connectionStatus$.next('reconnecting');
      this.reconnectAttempts = attemptNumber;
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`Reconnected after ${attemptNumber} attempts`);
      this.connectionStatus$.next('connected');
      this.reconnectAttempts = 0;
      
      this.notificationService.clearConnectionNotifications();
      
      this.lastDisconnectTime = undefined;
      
      this.resubscribeToActiveAuctions();
    });

  
    this.socket.on('reconnect_error', (error) => {
      console.log('Reconnection error:', error.message);
    });

    this.socket.on('reconnect_failed', () => {
      console.log('All reconnection attempts failed');
    });
  }


  private resubscribeToActiveAuctions() {
    console.log(`Resubscribing to ${this.activeAuctionSubscriptions.size} auctions...`);
    
    this.activeAuctionSubscriptions.forEach(auctionId => {
      this.rejoinAuctionSilently(auctionId);
    });
  }

 
  private rejoinAuctionSilently(auctionId: string) {
    if (!this.socket?.connected) return;

    this.socket.emit('auction:join', { auctionId }, (response: any) => {
      if (response?.success) {
        console.log(`Resubscribed to auction ${auctionId}`);
      } else {
        console.error(`Failed to resubscribe to auction ${auctionId}:`, response?.error);
        
        setTimeout(() => this.rejoinAuctionSilently(auctionId), 2000);
      }
    });
  }

  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.reconnectAttempts++;
    });

    this.socket.on('auction:update', (payload) => {
      this.auctionUpdate$.next(payload);
    });

    this.socket.on('auction:tick', (payload) => {
      this.auctionTick$.next(payload);
    });

    this.socket.on('auction:status-change', (payload) => {
      this.auctionStatusChange$.next(payload);
      
      this.globalUpdate$.next({type: 'auction:status-change', ...payload});
    });

    this.socket.on('auction:created', (payload) => {
      this.globalUpdate$.next({
        type: 'auction:created',
        ...payload
      });
    });

    this.socket.on('auction:bid-update', (payload) => {
      this.globalUpdate$.next({ type: 'auction:bid-update',...payload});
    });

    this.socket.on('bid:update', (payload) => {
      this.bidUpdate$.next(payload);
    });

    this.socket.on('bid:outbid', (payload) => {
      this.outbidNotification$.next(payload);
    });


    this.socket.on('auction:extended', (payload) => {
      this.auctionUpdate$.next({...payload,type: 'extended' });
    });
  }

  onAuctionUpdate(){
    return this.auctionUpdate$.asObservable();
  }

  onAuctionTick() {
    return this.auctionTick$.asObservable();
  }

  onAuctionStatusChange() {
    return this.auctionStatusChange$.asObservable();
  }

  onBidUpdate() {
    return this.bidUpdate$.asObservable();
  }

  onOutbidNotification() {
    return this.outbidNotification$.asObservable();
  }

  onGlobalUpdate() {
    return this.globalUpdate$.asObservable();
  }


  getConnectionStatus(){
    return this.connectionStatus$.asObservable();
  }

  onConnectionChange(){
    return this.connectionStatus$.asObservable().pipe(map(status => status === 'connected') );
  }

 
  joinAuction(auctionId: string) {
    return new Observable(observer => {
      if (!this.socket?.connected) {
        observer.error('Socket not connected');
        return;
      }

      this.socket.emit('auction:join', { auctionId }, (response: any) => {
        if (response?.success) {
          
          this.activeAuctionSubscriptions.add(auctionId);
          observer.next(response);
          observer.complete();
        } else {
          observer.error(response?.error || 'Failed to join auction');
        }
      });
    });
  }

  joinAuctionRoom(auctionId: string) {
    this.joinAuction(auctionId).subscribe({
      next: () => console.log(`Joined auction ${auctionId}`),
      error: (error) => console.error(`Failed to join auction ${auctionId}:`, error)
    });
  }

  
  leaveAuction(auctionId: string) {
    if (this.socket?.connected) {
      this.socket.emit('auction:leave', { auctionId });
    }
    
    this.activeAuctionSubscriptions.delete(auctionId);

  }

  leaveAuctionRoom(auctionId: string) {
    this.leaveAuction(auctionId);
  }


  placeBid(auctionId: string, amount: number, clientId?: string) {
    return new Observable(observer => {
      if (!this.socket?.connected) {
        observer.error('Not connected to server');
        return;
      }

      this.socket.emit('bid:place', 
        { 
          auctionId, 
          amount,
          clientId: clientId || this.generateClientId()
        }, 
        (response: any) => {
          if (response?.success) {
            observer.next(response.data);
            observer.complete();
          } else {
            observer.error(response?.error || 'Failed to place bid');
          }
        }
      );
    });
  }

  isConnected() {
    return this.socket?.connected || false;
  }

  
  checkConnectionStatus() {
    const isConnected = this.isConnected();
    const status = this.connectionStatus$.value;
    
    return { isConnected, status };
  }


  showConnectionStatusNotification() {
    const isConnected = this.isConnected();
    
    if (!isConnected && this.wasConnectedBefore) {
      this.notificationService.showNotification(
        'warning',
        'Not Connected',
        'You are currently offline. Some features may not work properly.',
        5000
      );
    } else if (isConnected) {
      this.notificationService.showNotification(
        'success',
        'Connected',
        'You are connected and all features are available.',
        3000
      );
    }
    
    return this.getConnectionInfo();
  }


  getConnectionInfo() {
    return {
      isConnected: this.isConnected(),
      status: this.connectionStatus$.value,
      reconnectAttempts: this.reconnectAttempts,
      activeSubscriptions: this.activeAuctionSubscriptions.size,
      wasConnectedBefore: this.wasConnectedBefore
    };
  }

  disconnect() {
    if (this.socket) {
      
      this.activeAuctionSubscriptions.clear();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connectionStatus$.next('disconnected');
    this.wasConnectedBefore = false;
    this.lastDisconnectTime = undefined;
  }

  private generateClientId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}