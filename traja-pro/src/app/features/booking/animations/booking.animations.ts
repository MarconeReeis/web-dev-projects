import {
  animate,
  group,
  query,
  style,
  transition,
  trigger,
} from '@angular/animations';

export const bookingStepAnimation = trigger('bookingStep', [
  transition('void => forward', [
    group([
      query(':enter', [
        style({ opacity: 0, transform: 'translateX(24px)' }),
        animate('320ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'translateX(0)' })),
      ], { optional: true }),
    ]),
  ]),
  transition('void => back', [
    group([
      query(':enter', [
        style({ opacity: 0, transform: 'translateX(-24px)' }),
        animate('320ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'translateX(0)' })),
      ], { optional: true }),
    ]),
  ]),
]);

export const fadeInUpAnimation = trigger('fadeInUp', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(16px)' }),
    animate('400ms 100ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'translateY(0)' })),
  ]),
]);

export const scaleInAnimation = trigger('scaleIn', [
  transition(':enter', [
    style({ opacity: 0, transform: 'scale(0.85)' }),
    animate('450ms cubic-bezier(0.34, 1.56, 0.64, 1)', style({ opacity: 1, transform: 'scale(1)' })),
  ]),
]);

export const listStaggerAnimation = trigger('listStagger', [
  transition('* => *', [
    query(':enter', [
      style({ opacity: 0, transform: 'translateY(12px)' }),
      animate('280ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'translateY(0)' })),
    ], { optional: true }),
  ]),
]);
