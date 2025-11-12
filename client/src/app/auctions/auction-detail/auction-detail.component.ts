import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuctionsService } from '../../services/auctions.service';
import { SocketService } from '../../services/socket.service';
import { NotificationService } from '../../services/notification.service';
import { catchError, finalize, of, Subscription, tap } from 'rxjs';

@Component({
  selector: 'app-auction-detail',
  templateUrl: './auction-detail.component.html',
  styleUrls: ['./auction-detail.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [AuctionsService]
})
export class AuctionDetailComponent implements OnInit, OnDestroy {
  auction: any = null;
  auctionId = '';
  bidAmount: number = 0;
  isPending = false;
  isLoading = true;
  error = '';
  bidError = '';
  participantCount = 0;
  currentUser: any = null;
  
  isNewBidHighlighted = false;
  isBidHistoryHighlighted = false;
  
  private lastNotifiedHighestBid: { bidder: string; amount: number; id?: string } | null = null;
  
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';
  
  private subscriptions: Subscription[] = [];
  private timeUpdateInterval: any;

  constructor(
    private route: ActivatedRoute, 
    private auctionsService: AuctionsService, 
    public socketService: SocketService,
    private router: Router,
    private notificationService: NotificationService
  ) {}

   ngOnInit() {
    this.currentUser = { userName: localStorage.getItem('username') };
    this.auctionId = this.route.snapshot.paramMap.get('id')!;
    
    if (!this.auctionId) {
      this.error = 'Invalid auction ID';
      this.isLoading = false;
      return;
    }

    this.subscriptions.push(this.socketService.getConnectionStatus().subscribe(status => {
        this.connectionStatus = status;
      })
    );

    this.subscriptions.push(
        this.loadAuctionDetails().subscribe(() => {
          this.setupRealTimeUpdates();
          this.startTimeUpdates();
          this.joinAuctionRoom();
        })
      );

  }

loadAuctionDetails() {
  this.isLoading = true;
  this.error = '';

  return this.auctionsService.getAuction(this.auctionId).pipe(
    tap((auction) => {
      this.auction = auction;

      if (!auction) {
        this.error = 'Auction not found';
        return;
      }

      this.bidAmount = this.getMinimumBid();

      if (this.auction.highest) {
        this.lastNotifiedHighestBid = {
          bidder: this.auction.highest.bidder,
          amount: this.auction.highest.amount,
          id: this.auction.highest.id || `${this.auction.highest.bidder}-${this.auction.highest.amount}-initial`,
        };
      }
    }),
    catchError((err) => {
      this.error = err?.message || 'Failed to load auction details';
      return of(null);
    }),
    finalize(() => {
      this.isLoading = false;
    })
  );
}



  private joinAuctionRoom() {
    if (!this.auctionId) return;

    this.subscriptions.push(
      this.socketService.joinAuction(this.auctionId).subscribe({
        next: (response:any) => {
          if (response.auction) {
            this.auction = response.auction;
            this.bidAmount = this.getMinimumBid();
          }
          if (response.participantsOnline !== undefined) {
            this.participantCount = response.participantsOnline;
          }
        },
        error: (error) => {
          setTimeout(() => this.joinAuctionRoom(), 3000);
        }
      })
    );
  }

  setupRealTimeUpdates() {
    const tickSub = this.socketService.onAuctionTick().subscribe((tick: any) => {
      if (tick.auctionId === this.auctionId) {        
        if (tick.endTime) {
          this.auction.endTime = tick.endTime;
        }
      }
    });

    const auctionUpdateSub = this.socketService.onAuctionUpdate().subscribe((update: any) => {
      if (update.auctionId !== this.auctionId) return;
      
      if (update.data) {
        if (update.data.highest) {
         // const previousHighest = this.auction.highest;
          this.auction.highest = update.data.highest;
          
          const currentUsername = localStorage.getItem('username');
          const newBid = update.data.highest;
          
          const isNewBid = !this.lastNotifiedHighestBid || 
                          this.lastNotifiedHighestBid.bidder !== newBid.bidder ||
                          this.lastNotifiedHighestBid.amount !== newBid.amount ||
                          (newBid.id && this.lastNotifiedHighestBid.id !== newBid.id);
          
          if (isNewBid && newBid.bidder !== currentUsername) {
            this.lastNotifiedHighestBid = {
              bidder: newBid.bidder,
              amount: newBid.amount,
              id: newBid.id || `${newBid.bidder}-${newBid.amount}-${Date.now()}`
            };
            
            this.highlightNewBid();
          }
        }
        
        if (update.data.bids) {
          const oldBidsLength = this.auction.bids?.length || 0;
          this.auction.bids = update.data.bids;
          
          if (this.auction.bids.length > oldBidsLength) {
            this.highlightBidHistory();
          }
        }
        
        
        if (update.data.newEndTime) {
          this.auction.endTime = update.data.newEndTime;
        }
        
       
        if (update.data.participantsOnline !== undefined) {
          this.participantCount = update.data.participantsOnline;
        }
        
        
        if (update.data.extended) {
          this.notificationService.showAuctionExtended(this.auction.title);
        }
      }
      
      
      this.bidAmount = Math.max(this.bidAmount, this.getMinimumBid());
    });

    const statusChangeSub = this.socketService.onAuctionStatusChange().subscribe((statusChange: any) => {
      if (statusChange.auctionId === this.auctionId) {
        this.auction.status = statusChange.newStatus;
        
        if (statusChange.newStatus === 'active') {
          this.showNotification('Auction is now active! You can start bidding.', 'success');
        } else if (statusChange.newStatus === 'ended') {
          this.showNotification('Auction has ended!', 'info');
        }
      }
    });

    this.subscriptions.push(tickSub, auctionUpdateSub, statusChangeSub);
  }

  startTimeUpdates() {
    this.timeUpdateInterval = setInterval(() => {
      if (this.auction && this.auction.endTime) {
        const timeRemaining = this.getTimeRemaining();
        if (this.auction.status === 'active' && timeRemaining === 'Auction ended') {
          this.auction.status = 'ended';
          this.showNotification('Auction has ended!', 'info');
          if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
          }
        }
      }
    }, 1000);
  }

placeBid() {
  if (!this.canSubmitBid()) {
    return;
  }

  this.isPending = true;
  this.bidError = '';


  const minBid = this.getMinimumBid();

  if (this.bidAmount < minBid) {
    this.bidError = `Bid must be at least ${minBid}`;
    this.showNotification(this.bidError, 'error');
    return;
  }

  this.socketService.placeBid(this.auctionId, this.bidAmount).subscribe({
    next: (result) => {
      this.showNotification('Bid placed successfully!', 'success');


      this.bidAmount = this.getMinimumBid();
    },
    error: (err) => {
      this.bidError = err?.message || 'Failed to place bid';
      this.showNotification(this.bidError, 'error');
    },
    complete: () => {
      this.isPending = false;
    }
  });
}

  getMinimumBid(){
    if (!this.auction) return 0;
    const currentHighest = this.auction.highest?.amount || 0;
    const startingPrice = this.auction.startingPrice || 0;
    return Math.max(currentHighest + 1, startingPrice);
  }

  getCurrentBidAmount(){
    return this.auction?.highest?.amount || this.auction?.startingPrice || 0;
  }

  canPlaceBid() {
    return this.auction?.status === 'active' && !this.isTimeExpired();
  }

  canSubmitBid() {
    return this.canPlaceBid() &&  this.bidAmount >= this.getMinimumBid() && !this.isPending;
  }

  isTimeExpired() {
    if (!this.auction?.endTime) return false;
    return new Date(this.auction.endTime).getTime() <= Date.now();
  }

  isTimeUrgent() {
    if (!this.auction?.endTime || this.auction?.status !== 'active') return false;
    const timeLeft = new Date(this.auction.endTime).getTime() - Date.now();
    return timeLeft <= 30000;
  }

  getTimeRemaining() {
    if (!this.auction) return '';

    if (this.auction.status === 'scheduled') {
      
      const startTime = new Date(this.auction.startTime);
      const now = new Date();
      const diffToStart = startTime.getTime() - now.getTime();
      
      if (diffToStart > 0) {
        return this.formatTimeRemaining(diffToStart);
      } 
      else {
        return 'Starting now';
      }
    }

    if (this.auction.status === 'ended') {
      return 'Auction ended';
    }

    const endTime = new Date(this.auction.endTime);
    const now = new Date();
    const diff = endTime.getTime() - now.getTime();
    
    if (diff <= 0) return 'Auction ended';
    
    return this.formatTimeRemaining(diff);
  }

  formatTimeRemaining(milliseconds: number) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const seconds = totalSeconds % 60;

    if (this.auction?.status === 'active') {
      if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
      } else if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    } 
    else {
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
  }

  getTimeLabel(): string {
    if (this.auction?.status === 'scheduled') {
      return 'Starts in';
    } else if (this.auction?.status === 'ended') {
      return 'Ended';
    } else {
      return 'Time remaining';
    }
  }

  getSortedBids(): any[] {
    if (!this.auction?.bids) return [];
    
    return [...this.auction.bids].sort((a, b) => {
      const timeA = new Date(a.time || 0).getTime();
      const timeB = new Date(b.time || 0).getTime();
      return timeB - timeA;
    });
  }

  getBidsByAmount(){
    if (!this.auction?.bids) return [];
    return [...this.auction.bids].sort((a, b) => b.amount - a.amount);
  }

  getBidRank(bid: any) {
    const bidsByAmount = this.getBidsByAmount();
    return bidsByAmount.findIndex(b => b === bid) + 1;
  }

  isUserBid(bid: any) {
    const username = localStorage.getItem('username');
    return bid.bidder === username;
  }

  getStatusClass(status: string) {
    switch (status) {
      case 'active': return 'active';
      case 'scheduled': return 'scheduled';
      case 'ended': return 'ended';
      default: return '';
    }
  }

  getStatusIcon(status: string) {
    switch (status) {
      case 'active': return 'fas fa-fire';
      case 'scheduled': return 'fas fa-calendar-alt';
      case 'ended': return 'fas fa-flag-checkered';
      default: return 'fas fa-question';
    }
  }

  getStatusText(status: string){
    switch (status) {
      case 'active': return 'Active';
      case 'scheduled': return 'Scheduled';
      case 'ended': return 'Ended';
      default: return 'Unknown';
    }
  }

  showNotification(message: string, type: 'success' | 'error' | 'warning' | 'info') {
    this.notificationService.showNotification(type, 'Auction Action', message);
  }


  highlightNewBid() {
    this.isNewBidHighlighted = true;
    setTimeout(() => { this.isNewBidHighlighted = false;}, 3000); 
  }

  highlightBidHistory() {
    this.isBidHistoryHighlighted = true;
    setTimeout(() => { this.isBidHistoryHighlighted = false;}, 2000);
  }

  isRecentBid(bid: any) {
    if (!bid.time) return false;
    const bidTime = new Date(bid.time).getTime();
    const now = Date.now();
    return (now - bidTime) < 10000; 
  }


  goBack() {
    this.router.navigate(['/auctions']);
  }

  createAuction() {
    this.router.navigate(['/auction/create']);
  }

  logout() {
    localStorage.removeItem('username');
    this.socketService.disconnect();
    this.router.navigate(['/login']);
  }

  ngOnDestroy() {

    this.subscriptions.forEach(sub => sub.unsubscribe());
    
 
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
    }
    
    if (this.auctionId) {
      this.socketService.leaveAuction(this.auctionId);
    }
  }
}
