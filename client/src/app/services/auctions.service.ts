import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuctionsService {
  private baseUrl = `${environment.apiUrl}/api`;

  constructor(private http: HttpClient) {}

  listAuctions(){
    return this.http.get(`${this.baseUrl}/auctions`);
  }

   getAuction(id: string){
    return this.http.get(`${this.baseUrl}/auctions/${id}`);
  }

   createAuction(auctionData: any){
    return this.http.post(`${this.baseUrl}/auctions`, auctionData);
  }

   connectUser(username: string) {
    return this.http.post(`${this.baseUrl}/auth/connect`, { username });
  }
}