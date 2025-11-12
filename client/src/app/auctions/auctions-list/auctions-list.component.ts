import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { AuctionsService } from '../../services/auctions.service';
import { SocketService } from '../../services/socket.service';
import { NotificationService } from '../../services/notification.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-auctions-list',
  templateUrl: './auctions-list.component.html',
  styleUrls: ['./auctions-list.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class AuctionsListComponent implements OnInit, OnDestroy {

  selectedTab: 'Active' | 'Scheduled' | 'Ended' = 'Active';
  
  activeAuctions: any[] = [];
  scheduledAuctions: any[] = [];
  endedAuctions: any[] = [];
  
  get active(){
     return this.activeAuctions;
 }
  
  isLoading = false;
  currentUser: any = null;
  
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';
  
  private auctionsBeingMoved = new Set<string>();
  
  private lastUpdateTime: number = 0;
  
  private subscriptions: Subscription[] = [];
  private timeUpdateInterval: any;

  constructor(private auctionsService: AuctionsService, 
              private router: Router,
              public socketService: SocketService,
              private notificationService: NotificationService,
              private ngZone: NgZone) {}

  ngOnInit() { 
    this.currentUser = { userName: localStorage.getItem('username') };
    this.getConnectionStatus();
    this.loadAllAuctions();
    this.setupRealTimeUpdates();
    this.startTimeUpdates();
  }

  private getConnectionStatus() {
    this.subscriptions.push(
      this.socketService.getConnectionStatus().subscribe(status => {
        this.connectionStatus = status;        
        if (status === 'connected') {
          this.handleReconnection();
        } else if (status === 'reconnecting') {
          // Reconnecting.
        }
      })
    );
  }

  private handleReconnection() {
    
    const now = Date.now();
    const timeSinceLastUpdate = now - (this.lastUpdateTime || 0);
    
    if (timeSinceLastUpdate > 30000) {
      this.loadAllAuctions();
    } 
        
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
    }
    
  }

  private setupRealTimeUpdates() {
    const existingRealtimeSubscriptions = this.subscriptions.filter(sub => 
      sub !== null && !sub.closed
    );
        
    const auctionUpdateSub = this.socketService.onAuctionUpdate().subscribe((update: any) => {
      this.handleAuctionUpdate(update);
    });

    const auctionTickSub = this.socketService.onAuctionTick().subscribe((tick: any) => {
      this.handleAuctionTick(tick);
    });

    const statusChangeSub = this.socketService.onAuctionStatusChange().subscribe((change: any) => {
      this.handleStatusChange(change);
    });

    const globalUpdateSub = this.socketService.onGlobalUpdate().subscribe((globalUpdate: any) => {
      this.handleGlobalUpdate(globalUpdate);
    });

    this.subscriptions.push(auctionUpdateSub, auctionTickSub, statusChangeSub, globalUpdateSub);
    
      }

  private startTimeUpdates() {
    this.timeUpdateInterval = setInterval(() => {
     this.ngZone.run(() => {});

    }, 1000);
  }
    
  private handleGlobalUpdate(globalUpdate: any) {
    this.lastUpdateTime = Date.now();
    
    if (globalUpdate.type === 'auction:created' && globalUpdate.auction) {
      const auction = globalUpdate.auction;
      this.addAuctionToCategory(auction, auction.status);
      
      const currentUsername = localStorage.getItem('username');
      if (auction.createdBy !== currentUsername) {
        this.notificationService.showAuctionCreated(auction.title, auction.createdBy);
      }
    }
    
    if (globalUpdate.type === 'auction:bid-update' && globalUpdate.auction) {
      const updatedAuction = globalUpdate.auction;
      this.updateAuctionInArrays(updatedAuction.id, updatedAuction);
      
    }
    
    if (globalUpdate.type === 'auction:status-change' && globalUpdate.auction) {
      const { auctionId, oldStatus, newStatus, auction } = globalUpdate;
      
      if (!auctionId || !oldStatus || !newStatus || !auction) {
        return;
      }
      
      this.auctionsBeingMoved.add(auctionId);
      
      this.removeAuctionFromCategory(auctionId, oldStatus);
      
      this.addAuctionToCategory(auction, newStatus);
            
      setTimeout(() => {this.auctionsBeingMoved.delete(auctionId);}, 2000);
      
      if (newStatus === 'active' && oldStatus === 'scheduled') {
        this.notificationService.showAuctionStatusChange(auction.title, 'active');
      } else if (newStatus === 'ended') {
        this.notificationService.showAuctionStatusChange(auction.title, 'ended');
      }
      
    }
  }

  private handleAuctionUpdate(update: any) {
 
    this.lastUpdateTime = Date.now();
    
    this.updateAuctionInArrays(update.auctionId, update.data);
    
    this.markAuctionAsUpdated(update.auctionId);
    
    if (update.data) {
      if (update.data.highest) {
        const auction = this.findAuctionById(update.auctionId);
        if (auction) {
          this.updateAuctionInArrays(update.auctionId, auction);
        }
      }
      
      if (update.data.extended) {
        const auction = this.findAuctionById(update.auctionId);
        if (auction) {
          this.notificationService.showAuctionExtended(auction.title);
        }
      }
    }
  }

  private handleAuctionTick(tick: any) {
    const auction = this.findAuctionById(tick.auctionId);
    if (auction) {
      auction.timeRemaining = tick.timeRemaining;
      auction.serverTime = tick.serverTime;
    }
  }

  private handleStatusChange(change: any) {
    this.lastUpdateTime = Date.now();
    
    const { auctionId, oldStatus, newStatus, auction: updatedAuction } = change;
    
    if (!auctionId || !oldStatus || !newStatus || !updatedAuction) {
      return;
    }
    
    this.auctionsBeingMoved.add(auctionId);
    
    this.removeAuctionFromCategory(auctionId, oldStatus);
    
    this.addAuctionToCategory(updatedAuction, newStatus);
    
    console.log(`After: Active(${this.activeAuctions.length}), Scheduled(${this.scheduledAuctions.length}), Ended(${this.endedAuctions.length})`);
    
    setTimeout(() => {this.auctionsBeingMoved.delete(auctionId);}, 2000);
    
    if (updatedAuction) {
      if (newStatus === 'active' && oldStatus === 'scheduled') {
        this.notificationService.showAuctionStatusChange(updatedAuction.title, 'active');
      } 
      else if (newStatus === 'ended') {
        const winner = updatedAuction.highest?.bidder;
        if (winner) {
          this.notificationService.showSuccess( 'Auction Ended',`"${updatedAuction.title}" has ended. Winner: ${winner}` );
        } 
        else {
          this.notificationService.showInfo('Auction Ended',`"${updatedAuction.title}" has ended with no bids.`);
        }
      }
    }
  }

  private findAuctionById(auctionId: string){
    return [...this.activeAuctions, ...this.scheduledAuctions, ...this.endedAuctions]
            .find(auction => auction._id === auctionId || auction.id === auctionId);
  }


  private updateAuctionInArrays(auctionId: string, updateData: any) {
    
    [this.activeAuctions, this.scheduledAuctions, this.endedAuctions].forEach(
      (array, arrayIndex) => {
      const arrayNames = ['active', 'scheduled', 'ended'];
      const arrayName = arrayNames[arrayIndex];
      
      const index = array.findIndex(auction => auction._id === auctionId || auction.id === auctionId);
      if (index !== -1) {
        array[index] = { ...array[index], ...updateData };
      }
    });
  }

  private removeAuctionFromCategory(auctionId: string, status: string) {
    const arrayMap = {
      'scheduled': this.scheduledAuctions,
      'active': this.activeAuctions,
      'ended': this.endedAuctions
    };
    
    const array = arrayMap[status as keyof typeof arrayMap];
    if (array) {
      
      const index = array.findIndex(auction => {
        const match = auction._id === auctionId || auction.id === auctionId;

        return match;
      });
      
    }
  }

  private addAuctionToCategory(auction: any, status: string) {
    if (!auction) {
      return;
    }
    
    const auctionId = auction._id || auction.id;
    
    const arrayMap = {
      'scheduled': this.scheduledAuctions,
      'active': this.activeAuctions,
      'ended': this.endedAuctions
    };
    
    const array = arrayMap[status as keyof typeof arrayMap];
    if (array) {
      
      const existingIndex = array.findIndex(a => {
        const aId = a._id || a.id;
        return aId === auctionId;
      });
      
      if (existingIndex === -1) {
        auction._isNew = true;
        array.push(auction);
        
        setTimeout(() => {
          auction._isNew = false;
        }, 5000);
      } 
      else {
        array[existingIndex] = { ...array[existingIndex], ...auction };
      }
    }
     
  }

  selectTab(tab: 'Active' | 'Scheduled' | 'Ended') {
    this.selectedTab = tab;
  }

  get currentAuctions(): any[] {
    switch(this.selectedTab) {
      case 'Active': return this.activeAuctions;
      case 'Scheduled': return this.scheduledAuctions;
      case 'Ended': return this.endedAuctions;
      default: return [];
    }
  }

  loadAllAuctions() {
  this.isLoading = true;

  this.auctionsService.listAuctions().subscribe({
    next: (res:any) => {
      this.activeAuctions = res.active || [];
      this.scheduledAuctions = res.scheduled || [];
      this.endedAuctions = res.ended || [];
    },
    error: (error) => {
      console.error('Error:', error);
    },
    complete: () => {
      this.isLoading = false;
    }
  });
}
  viewAuctionDetails(auctionId: string) {
    this.router.navigate(['/auction', auctionId]);
  }

  createNewAuction() {
    this.router.navigate(['/auction/create']);
  }

  getCurrentBid(auction: any) {
    return auction.highest?.amount || auction.startingPrice || 0;
  }

  getBidDisplayValue(auction: any) {
    if (auction.status === 'scheduled') {
      return auction.startingPrice || 0;
    }
    return this.getCurrentBid(auction);
  }

  getTimeRemaining(auction: any) {
    if (auction.status === 'scheduled') {
      const startTime = new Date(auction.startTime);
      const now = new Date();
      const diffToStart = startTime.getTime() - now.getTime();
      
      if (diffToStart > 0) {
        // Calculate time until auction starts
        const days = Math.floor(diffToStart / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffToStart % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffToStart % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffToStart % (1000 * 60)) / 1000);
        
        if (days > 0) {
          return `Starts in ${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
          return `Starts in ${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
          return `Starts in ${minutes}m ${seconds}s`;
        } else {
          return `Starts in ${seconds}s`;
        }
      } 
      else {
        return 'Starting now';
      }
    }
    
    if (auction.timeRemaining) {
      return auction.timeRemaining; 
    }
    
    const endTime = new Date(auction.endTime);
    const now = new Date();
    const diff = endTime.getTime() - now.getTime();
    
    if (diff <= 0) return 'Ended';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  isUrgent(auction: any): boolean {
    const endTime = new Date(auction.endTime);
    const now = new Date();
    const diff = endTime.getTime() - now.getTime();
    return diff <= (10 * 1000); 
  }

  refreshAuctions() {
    this.loadAllAuctions();
  }

  logout() {
    localStorage.removeItem('username');
    this.socketService.disconnect();
    this.router.navigate(['/login']);
  }


  private markAuctionAsUpdated(auctionId: string) {
    const auction = this.findAuctionById(auctionId);
    if (auction) {
      auction._justUpdated = true;
      setTimeout(() => {
        auction._justUpdated = false;
      }, 3000);
    }
  }
}