import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { Router } from '@angular/router';
import { AuctionsService } from '../../services/auctions.service';
import { SocketService } from '../../services/socket.service';
import { NotificationService } from '../../services/notification.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-auction-create',
  templateUrl: './auction-create.component.html',
  styleUrls: ['./auction-create.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule]
})


export class AuctionCreateComponent implements OnInit, OnDestroy {

  auctionForm!: FormGroup;
  isSubmitting = false;
  errorMessage = '';
  currentUser: any = null;
  
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';
  
  private subscriptions: Subscription[] = [];
  
  currencies = [
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥' }
  ];

  constructor( private fb: FormBuilder,
    private router: Router,
    private auctionsService: AuctionsService,
    public socketService: SocketService,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    this.currentUser = { userName: localStorage.getItem('username') };
    this.setupConnectionStatus();
    this.initializeForm();
  }



  private setupConnectionStatus() {

    this.subscriptions.push(
      this.socketService.getConnectionStatus().subscribe(status => {
        this.connectionStatus = status;
      })
    );
  }

  private initializeForm(){

    const now = new Date();
    const defaultStartTime = new Date(now.getTime() + 1* 60 * 1000); 
    const minEndTime = new Date(now.getTime() + 60 * 60 * 1000);
    
    this.auctionForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(100)]],
      description: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(500)]],
      startingPrice: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['USD', [Validators.required]],
      startTime: ['', [Validators.required, this.startTimeValidator]],
      endTime: ['', [Validators.required, this.endTimeValidator]],
      reservePrice: ['']
    });

    this.auctionForm.patchValue({
      startTime: this.formatDateTimeLocal(defaultStartTime),
      endTime: this.formatDateTimeLocal(minEndTime)
    });

    this.auctionForm.get('startTime')?.valueChanges.subscribe(() => {
      this.auctionForm.get('endTime')?.updateValueAndValidity();
    });
  }


  private startTimeValidator(control: AbstractControl){
  if (!control.value) return null;

  const selectedTime = new Date(control.value);
  const now = new Date();

  if (selectedTime <= now) {
    return { pastTime: true };
  }

  return null;
}

private endTimeValidator(control: AbstractControl) {
  if (!control.value) return null;

  const endTime = new Date(control.value);
  const now = new Date();

  if (endTime <= now) {
    return { pastTime: true };
  }

  const startTimeControl = control.parent?.get('startTime');
  if (startTimeControl?.value) {
    const startTime = new Date(startTimeControl.value);
    const minDuration = 30 * 60 * 1000;

    if (endTime <= startTime) {
      return { beforeStartTime: true };
    }

    if (endTime.getTime() - startTime.getTime() < minDuration) {
      return { tooShort: true };
    }
  }

  return null;
}


  private formatDateTimeLocal(date: Date){
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  onSubmit() {
  if (this.auctionForm.invalid) {
    this.markFormGroupTouched();
    return;
  }

  this.isSubmitting = true;
  this.errorMessage = '';

  const formValue = this.auctionForm.value;

  const auctionData = {
    title: formValue.title.trim(),
    description: formValue.description.trim(),
    startingPrice: Number(formValue.startingPrice),
    currency: formValue.currency,
    startTime: new Date(formValue.startTime).toISOString(),
    endTime: new Date(formValue.endTime).toISOString(),
    reservePrice: formValue.reservePrice ? Number(formValue.reservePrice) : null
  };

  if (auctionData.reservePrice && auctionData.reservePrice <= auctionData.startingPrice) {
    this.errorMessage = 'Reserve price must be higher than starting price';
    this.isSubmitting = false;
    return;
  }

  this.auctionsService.createAuction(auctionData).subscribe({
    next: (result) => {
      this.notificationService.showSuccess('Auction Created!', `"${auctionData.title}" has been successfully created.`);

      this.router.navigate(['/auctions']);
    },
    error: (error) => {
      this.errorMessage = error.error?.error ||error.error?.message || 'Failed to create auction.';

      this.notificationService.showError('Creation Failed', this.errorMessage);
      this.isSubmitting = false;
    },
    complete: () => {
      this.isSubmitting = false;
    }
  });
}

  private markFormGroupTouched() {
    Object.keys(this.auctionForm.controls).forEach(key => {
      const control = this.auctionForm.get(key);
      control?.markAsTouched();
    });
  }

  isFieldInvalid(fieldName: string){
    const field = this.auctionForm.get(fieldName);
    return !!(field?.invalid && field?.touched);
  }

  getFieldError(fieldName: string){
    const field = this.auctionForm.get(fieldName);
    if (!field?.errors || !field?.touched) return '';

    if (field.errors['required']) return `${this.getFieldDisplayName(fieldName)} is required`;
    if (field.errors['minlength']) return `${this.getFieldDisplayName(fieldName)} is too short`;
    if (field.errors['maxlength']) return `${this.getFieldDisplayName(fieldName)} is too long`;
    if (field.errors['min']) return `${this.getFieldDisplayName(fieldName)} must be greater than 0`;
    if (field.errors['pastTime']) return `${this.getFieldDisplayName(fieldName)} must be in the future`;
    if (field.errors['beforeStartTime']) return 'End time must be after start time';
    if (field.errors['tooShort']) return 'Auction must run for at least 30 minutes';

    return 'Invalid value';
  }

  private getFieldDisplayName(fieldName: string) {
    const displayNames: { [key: string]: string } = {
      title: 'Title',
      description: 'Description',
      startingPrice: 'Starting price',
      currency: 'Currency',
      startTime: 'Start time',
      endTime: 'End time',
      reservePrice: 'Reserve price'
    };
    return displayNames[fieldName] || fieldName;
  }

  onCancel(): void {
    this.router.navigate(['/']);
  }

  goToAuctions(): void {
    this.router.navigate(['/auctions']);
  }

  logout(): void {
     localStorage.removeItem('username');
    this.socketService.disconnect();
    this.router.navigate(['/login']);
  }

    ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}