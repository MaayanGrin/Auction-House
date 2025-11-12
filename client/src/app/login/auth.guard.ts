import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { CanActivateFn } from '@angular/router';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const username = localStorage.getItem('username');
  
  if (username) {
    return true;
  } else {
    router.navigate(['/login']);
    return false;
  }
};