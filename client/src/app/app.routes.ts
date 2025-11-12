import { Routes } from '@angular/router';
import { authGuard } from './login/auth.guard';

export const routes: Routes = [
  { 
    path: 'login',
    loadComponent: () => import('./login/login.component').then(c => c.LoginComponent)
  },
  { 
    path: 'auctions', 
    loadComponent: () => import('./auctions/auctions-list/auctions-list.component').then(c => c.AuctionsListComponent),
    canActivate: [authGuard]
  },
  { 
    path: 'auction/create',
    loadComponent: () => import('./auctions/auction-create/auction-create.component').then(c => c.AuctionCreateComponent),
    canActivate: [authGuard]
  },
  { 
    path: 'auction/:id', 
    loadComponent: () => import('./auctions/auction-detail/auction-detail.component').then(c => c.AuctionDetailComponent),
    canActivate: [authGuard]
  },
  { path: '', redirectTo: '/auctions', pathMatch: 'full' },
  { path: '**', redirectTo: '/auctions' }
];
