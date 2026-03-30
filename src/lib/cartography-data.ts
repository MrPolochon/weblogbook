export const SVG_W = 1024;
export const SVG_H = 787;
export const PTFS_OFFICIAL_CHART_SRC = '/maps/ptfs-enroute-chart-official.svg';

export interface Point {
  x: number;
  y: number;
}

export interface Island {
  id: string;
  name: string;
  points: Point[];
  fill: string;
  stroke: string;
}

export interface FIRZone {
  id: string;
  code: string;
  name: string;
  points: Point[];
  color: string;
  borderColor: string;
}

export interface Waypoint {
  code: string;
  x: number;
  y: number;
}

export interface VorPoint {
  code: string;
  freq: string;
  x: number;
  y: number;
  name: string;
}

export interface CartographyDraftData {
  positions: Record<string, Point>;
  islands: Island[];
  firZones: FIRZone[];
  waypoints: Waypoint[];
  vors: VorPoint[];
}

export const DEFAULT_POSITIONS: Record<string, Point> = {
  IBAR: { x: 72.3, y: 86.4 },
  IBLT: { x: 42.5, y: 64.8 },
  IBTH: { x: 54.9, y: 43.5 },
  IGAR: { x: 39.2, y: 71.7 },
  IGRV: { x: 17.2, y: 44.1 },
  IHEN: { x: 63.9, y: 88.2 },
  IIAB: { x: 68, y: 87 },
  IJAF: { x: 85.8, y: 47.1 },
  ILAR: { x: 66.9, y: 79.7 },
  ILKL: { x: 68.8, y: 31.3 },
  IMLR: { x: 36.7, y: 61.6 },
  IPAP: { x: 74.9, y: 81.2 },
  IPPH: { x: 64.4, y: 27.4 },
  IRFD: { x: 49.4, y: 68.4 },
  ISAU: { x: 15.1, y: 74.2 },
  ISCM: { x: 79, y: 43.1 },
  ISKP: { x: 70.8, y: 60 },
  ITKO: { x: 46.5, y: 19.7 },
  ITRC: { x: 50.1, y: 79 },
  IUFO: { x: 58, y: 43.6 },
  IZOL: { x: 85.2, y: 51.5 },
};

export const AIRPORT_NAMES: Record<string, string> = {
  ITKO: 'Tokyo Intl.',
  IPPH: 'Perth Intl.',
  ILKL: 'Lukla',
  IGRV: 'Grindavik',
  ISAU: 'Sauthemptona',
  IBTH: 'St Barthelemy',
  IMLR: 'Mellor Intl.',
  IBLT: 'Boltic',
  IRFD: 'Greater Rockford',
  IGAR: 'Air Base Garry',
  ITRC: 'Training Centre',
  ISCM: 'RAF Scampton',
  IZOL: 'Izolirani Intl.',
  IJAF: 'Al Najaf',
  ISKP: 'Skopelos',
  ILAR: 'Larnaca Intl.',
  IPAP: 'Paphos Intl.',
  IBAR: 'Barra',
  IHEN: 'Henstridge',
  IIAB: 'McConnell AFB',
  IUFO: 'UFO Base',
};

export const AIRPORT_TO_FIR: Record<string, string> = {
  ITKO: 'TOKYO',
  IPPH: 'PERTH',
  ILKL: 'PERTH',
  IGRV: 'GRINDAVI',
  ISAU: 'SAUTHEMP',
  IBTH: 'ROCKFORD',
  IUFO: 'ROCKFORD',
  IMLR: 'ROCKFORD',
  IBLT: 'ROCKFORD',
  IRFD: 'ROCKFORD',
  IGAR: 'ROCKFORD',
  ITRC: 'ROCKFORD',
  ISCM: 'IZOLIRAN',
  IZOL: 'IZOLIRAN',
  IJAF: 'IZOLIRAN',
  ISKP: 'IZOLIRAN',
  ILAR: 'CYPRUS F',
  IPAP: 'CYPRUS F',
  IBAR: 'CYPRUS F',
  IHEN: 'CYPRUS F',
  IIAB: 'CYPRUS F',
};

export const DEFAULT_ISLANDS: Island[] = [
  { id: 'rockford_est', name: 'Rockford est', points: [{ x: 451, y: 522 }, { x: 452, y: 509 }, { x: 449, y: 505 }, { x: 446, y: 502 }, { x: 446, y: 498 }, { x: 445, y: 494 }, { x: 445, y: 492 }, { x: 449, y: 488 }, { x: 450, y: 484 }, { x: 452, y: 481 }, { x: 455, y: 480 }, { x: 460, y: 477 }, { x: 460, y: 474 }, { x: 461, y: 470 }, { x: 465, y: 469 }, { x: 471, y: 469 }, { x: 476, y: 470 }, { x: 480, y: 479 }, { x: 482, y: 483 }, { x: 485, y: 490 }, { x: 482, y: 496 }, { x: 478, y: 502 }, { x: 475, y: 508 }, { x: 471, y: 513 }, { x: 471, y: 517 }, { x: 474, y: 523 }, { x: 475, y: 525 }, { x: 479, y: 526 }, { x: 485, y: 526 }, { x: 489, y: 529 }, { x: 490, y: 530 }, { x: 497, y: 528 }, { x: 503, y: 524 }, { x: 512, y: 527 }, { x: 512, y: 527 }, { x: 514, y: 522 }, { x: 514, y: 522 }, { x: 523, y: 525 }, { x: 523, y: 525 }, { x: 526, y: 533 }, { x: 525, y: 538 }, { x: 524, y: 541 }, { x: 519, y: 551 }, { x: 519, y: 553 }, { x: 517, y: 553 }, { x: 514, y: 554 }, { x: 513, y: 557 }, { x: 513, y: 562 }, { x: 513, y: 572 }, { x: 520, y: 578 }, { x: 517, y: 585 }, { x: 513, y: 591 }, { x: 511, y: 598 }, { x: 513, y: 604 }, { x: 516, y: 608 }, { x: 519, y: 610 }, { x: 523, y: 613 }, { x: 524, y: 618 }, { x: 523, y: 627 }, { x: 521, y: 631 }, { x: 516, y: 631 }, { x: 511, y: 630 }, { x: 508, y: 626 }, { x: 508, y: 620 }, { x: 508, y: 618 }, { x: 504, y: 615 }, { x: 501, y: 613 }, { x: 499, y: 608 }, { x: 497, y: 605 }, { x: 494, y: 602 }, { x: 493, y: 595 }, { x: 486, y: 592 }, { x: 477, y: 587 }, { x: 474, y: 582 }, { x: 472, y: 577 }, { x: 469, y: 574 }, { x: 461, y: 571 }, { x: 458, y: 566 }, { x: 456, y: 561 }, { x: 452, y: 557 }, { x: 452, y: 549 }, { x: 448, y: 546 }, { x: 446, y: 540 }, { x: 447, y: 536 }, { x: 447, y: 532 }, { x: 448, y: 528 }, { x: 449, y: 524 }, { x: 449, y: 523 }, { x: 449, y: 526 }, { x: 449, y: 526 }, { x: 449, y: 523 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'rockford_ouest', name: 'Rockford ouest', points: [{ x: 433, y: 550 }, { x: 436, y: 552 }, { x: 439, y: 551 }, { x: 441, y: 548 }, { x: 444, y: 545 }, { x: 444, y: 543 }, { x: 442, y: 541 }, { x: 443, y: 537 }, { x: 443, y: 534 }, { x: 444, y: 531 }, { x: 444, y: 528 }, { x: 444, y: 526 }, { x: 446, y: 523 }, { x: 448, y: 518 }, { x: 448, y: 514 }, { x: 449, y: 511 }, { x: 447, y: 509 }, { x: 445, y: 506 }, { x: 443, y: 503 }, { x: 442, y: 499 }, { x: 441, y: 496 }, { x: 442, y: 493 }, { x: 443, y: 487 }, { x: 443, y: 484 }, { x: 443, y: 480 }, { x: 442, y: 477 }, { x: 440, y: 476 }, { x: 437, y: 476 }, { x: 433, y: 476 }, { x: 428, y: 478 }, { x: 425, y: 481 }, { x: 420, y: 486 }, { x: 419, y: 490 }, { x: 419, y: 493 }, { x: 418, y: 500 }, { x: 415, y: 500 }, { x: 411, y: 506 }, { x: 408, y: 510 }, { x: 404, y: 515 }, { x: 400, y: 520 }, { x: 397, y: 524 }, { x: 400, y: 528 }, { x: 403, y: 536 }, { x: 409, y: 547 }, { x: 409, y: 547 }, { x: 410, y: 555 }, { x: 407, y: 559 }, { x: 402, y: 560 }, { x: 402, y: 557 }, { x: 399, y: 555 }, { x: 399, y: 555 }, { x: 398, y: 560 }, { x: 396, y: 564 }, { x: 393, y: 568 }, { x: 390, y: 570 }, { x: 386, y: 569 }, { x: 382, y: 574 }, { x: 375, y: 576 }, { x: 370, y: 573 }, { x: 364, y: 568 }, { x: 360, y: 563 }, { x: 356, y: 560 }, { x: 352, y: 562 }, { x: 352, y: 567 }, { x: 351, y: 571 }, { x: 348, y: 576 }, { x: 350, y: 586 }, { x: 356, y: 591 }, { x: 363, y: 595 }, { x: 368, y: 599 }, { x: 367, y: 604 }, { x: 364, y: 610 }, { x: 365, y: 614 }, { x: 368, y: 618 }, { x: 373, y: 620 }, { x: 378, y: 621 }, { x: 383, y: 623 }, { x: 389, y: 623 }, { x: 391, y: 622 }, { x: 391, y: 617 }, { x: 388, y: 612 }, { x: 386, y: 608 }, { x: 388, y: 605 }, { x: 392, y: 603 }, { x: 396, y: 601 }, { x: 394, y: 609 }, { x: 394, y: 609 }, { x: 395, y: 615 }, { x: 398, y: 616 }, { x: 404, y: 611 }, { x: 410, y: 605 }, { x: 415, y: 601 }, { x: 420, y: 591 }, { x: 425, y: 585 }, { x: 426, y: 582 }, { x: 425, y: 578 }, { x: 423, y: 574 }, { x: 425, y: 569 }, { x: 427, y: 563 }, { x: 427, y: 554 }, { x: 427, y: 554 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'queen_island', name: 'queen island', points: [{ x: 499, y: 460 }, { x: 500, y: 457 }, { x: 507, y: 458 }, { x: 511, y: 458 }, { x: 516, y: 460 }, { x: 521, y: 463 }, { x: 521, y: 466 }, { x: 520, y: 470 }, { x: 518, y: 472 }, { x: 513, y: 473 }, { x: 509, y: 472 }, { x: 502, y: 472 }, { x: 500, y: 472 }, { x: 498, y: 473 }, { x: 497, y: 474 }, { x: 491, y: 471 }, { x: 492, y: 466 }, { x: 492, y: 466 }, { x: 494, y: 462 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'mellor_island', name: 'Mellor Island', points: [{ x: 375, y: 457 }, { x: 381, y: 453 }, { x: 390, y: 460 }, { x: 394, y: 461 }, { x: 396, y: 463 }, { x: 398, y: 469 }, { x: 396, y: 475 }, { x: 395, y: 481 }, { x: 392, y: 485 }, { x: 387, y: 488 }, { x: 380, y: 490 }, { x: 377, y: 491 }, { x: 370, y: 492 }, { x: 365, y: 493 }, { x: 361, y: 490 }, { x: 358, y: 483 }, { x: 355, y: 477 }, { x: 355, y: 470 }, { x: 356, y: 465 }, { x: 360, y: 460 }, { x: 364, y: 456 }, { x: 364, y: 456 }, { x: 370, y: 453 }, { x: 370, y: 453 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'st_barthelemy', name: 'St Barthelemy', points: [{ x: 541, y: 326 }, { x: 541, y: 326 }, { x: 546, y: 332 }, { x: 546, y: 332 }, { x: 552, y: 334 }, { x: 552, y: 334 }, { x: 555, y: 340 }, { x: 558, y: 346 }, { x: 557, y: 351 }, { x: 559, y: 353 }, { x: 562, y: 357 }, { x: 564, y: 359 }, { x: 566, y: 362 }, { x: 566, y: 364 }, { x: 567, y: 366 }, { x: 570, y: 367 }, { x: 572, y: 362 }, { x: 575, y: 359 }, { x: 575, y: 361 }, { x: 576, y: 364 }, { x: 577, y: 366 }, { x: 579, y: 362 }, { x: 582, y: 359 }, { x: 587, y: 357 }, { x: 591, y: 355 }, { x: 594, y: 354 }, { x: 597, y: 352 }, { x: 595, y: 348 }, { x: 594, y: 345 }, { x: 594, y: 343 }, { x: 594, y: 340 }, { x: 595, y: 339 }, { x: 596, y: 338 }, { x: 597, y: 337 }, { x: 594, y: 334 }, { x: 591, y: 330 }, { x: 591, y: 330 }, { x: 590, y: 328 }, { x: 589, y: 326 }, { x: 590, y: 324 }, { x: 588, y: 323 }, { x: 585, y: 333 }, { x: 585, y: 333 }, { x: 581, y: 338 }, { x: 577, y: 338 }, { x: 575, y: 338 }, { x: 572, y: 341 }, { x: 567, y: 342 }, { x: 566, y: 340 }, { x: 566, y: 338 }, { x: 567, y: 336 }, { x: 566, y: 333 }, { x: 563, y: 331 }, { x: 562, y: 329 }, { x: 565, y: 326 }, { x: 560, y: 325 }, { x: 559, y: 324 }, { x: 558, y: 322 }, { x: 557, y: 319 }, { x: 553, y: 320 }, { x: 553, y: 323 }, { x: 553, y: 323 }, { x: 549, y: 323 }, { x: 546, y: 323 }, { x: 542, y: 323 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'cyprus', name: 'Cyprus', points: [{ x: 609, y: 732 }, { x: 611, y: 727 }, { x: 617, y: 724 }, { x: 620, y: 719 }, { x: 627, y: 711 }, { x: 627, y: 711 }, { x: 637, y: 703 }, { x: 637, y: 703 }, { x: 643, y: 697 }, { x: 645, y: 688 }, { x: 651, y: 685 }, { x: 657, y: 673 }, { x: 654, y: 667 }, { x: 643, y: 641 }, { x: 654, y: 644 }, { x: 660, y: 638 }, { x: 669, y: 644 }, { x: 678, y: 640 }, { x: 677, y: 630 }, { x: 684, y: 621 }, { x: 684, y: 621 }, { x: 695, y: 615 }, { x: 706, y: 609 }, { x: 719, y: 607 }, { x: 723, y: 603 }, { x: 726, y: 598 }, { x: 723, y: 592 }, { x: 723, y: 592 }, { x: 731, y: 592 }, { x: 736, y: 605 }, { x: 749, y: 604 }, { x: 758, y: 606 }, { x: 771, y: 614 }, { x: 773, y: 625 }, { x: 776, y: 629 }, { x: 774, y: 637 }, { x: 774, y: 637 }, { x: 780, y: 654 }, { x: 780, y: 654 }, { x: 778, y: 663 }, { x: 778, y: 663 }, { x: 775, y: 655 }, { x: 775, y: 655 }, { x: 770, y: 653 }, { x: 770, y: 653 }, { x: 766, y: 659 }, { x: 758, y: 669 }, { x: 753, y: 668 }, { x: 735, y: 671 }, { x: 730, y: 681 }, { x: 731, y: 697 }, { x: 719, y: 692 }, { x: 717, y: 695 }, { x: 711, y: 691 }, { x: 692, y: 688 }, { x: 692, y: 688 }, { x: 676, y: 694 }, { x: 676, y: 694 }, { x: 668, y: 699 }, { x: 656, y: 702 }, { x: 656, y: 702 }, { x: 645, y: 711 }, { x: 641, y: 718 }, { x: 630, y: 721 }, { x: 627, y: 725 }, { x: 619, y: 725 }, { x: 618, y: 728 }, { x: 614, y: 732 }, { x: 614, y: 732 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'sauthemptona', name: 'Sauthemptona', points: [{ x: 143, y: 575 }, { x: 148, y: 577 }, { x: 152, y: 580 }, { x: 152, y: 577 }, { x: 154, y: 578 }, { x: 158, y: 578 }, { x: 161, y: 579 }, { x: 165, y: 582 }, { x: 163, y: 585 }, { x: 162, y: 589 }, { x: 166, y: 589 }, { x: 163, y: 592 }, { x: 166, y: 594 }, { x: 164, y: 595 }, { x: 161, y: 596 }, { x: 158, y: 593 }, { x: 154, y: 591 }, { x: 151, y: 591 }, { x: 149, y: 592 }, { x: 146, y: 590 }, { x: 143, y: 591 }, { x: 141, y: 592 }, { x: 141, y: 587 }, { x: 137, y: 586 }, { x: 137, y: 583 }, { x: 141, y: 582 }, { x: 140, y: 580 }, { x: 138, y: 578 }, { x: 142, y: 579 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'skopelos', name: 'Skopelos', points: [{ x: 716, y: 465 }, { x: 720, y: 466 }, { x: 723, y: 465 }, { x: 728, y: 467 }, { x: 725, y: 470 }, { x: 721, y: 472 }, { x: 718, y: 474 }, { x: 721, y: 476 }, { x: 726, y: 475 }, { x: 731, y: 474 }, { x: 735, y: 475 }, { x: 741, y: 470 }, { x: 742, y: 466 }, { x: 742, y: 463 }, { x: 741, y: 460 }, { x: 741, y: 459 }, { x: 739, y: 457 }, { x: 736, y: 455 }, { x: 732, y: 453 }, { x: 728, y: 452 }, { x: 724, y: 452 }, { x: 717, y: 455 }, { x: 715, y: 460 }, { x: 715, y: 460 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'izolirani', name: 'Izolirani', points: [{ x: 823, y: 405 }, { x: 831, y: 406 }, { x: 836, y: 401 }, { x: 846, y: 400 }, { x: 862, y: 404 }, { x: 862, y: 408 }, { x: 863, y: 409 }, { x: 870, y: 411 }, { x: 878, y: 410 }, { x: 884, y: 409 }, { x: 887, y: 408 }, { x: 884, y: 401 }, { x: 880, y: 396 }, { x: 872, y: 392 }, { x: 866, y: 387 }, { x: 865, y: 383 }, { x: 861, y: 381 }, { x: 861, y: 378 }, { x: 862, y: 376 }, { x: 867, y: 380 }, { x: 867, y: 379 }, { x: 877, y: 377 }, { x: 877, y: 377 }, { x: 885, y: 378 }, { x: 885, y: 378 }, { x: 889, y: 377 }, { x: 890, y: 374 }, { x: 889, y: 370 }, { x: 887, y: 367 }, { x: 883, y: 364 }, { x: 879, y: 361 }, { x: 877, y: 356 }, { x: 875, y: 351 }, { x: 875, y: 348 }, { x: 876, y: 343 }, { x: 876, y: 338 }, { x: 875, y: 333 }, { x: 873, y: 330 }, { x: 871, y: 326 }, { x: 867, y: 326 }, { x: 863, y: 328 }, { x: 859, y: 335 }, { x: 853, y: 342 }, { x: 851, y: 351 }, { x: 853, y: 356 }, { x: 857, y: 356 }, { x: 860, y: 357 }, { x: 866, y: 361 }, { x: 866, y: 361 }, { x: 863, y: 363 }, { x: 859, y: 365 }, { x: 855, y: 368 }, { x: 851, y: 367 }, { x: 846, y: 366 }, { x: 843, y: 361 }, { x: 838, y: 358 }, { x: 834, y: 357 }, { x: 829, y: 352 }, { x: 824, y: 356 }, { x: 817, y: 358 }, { x: 810, y: 360 }, { x: 805, y: 364 }, { x: 803, y: 369 }, { x: 806, y: 372 }, { x: 809, y: 374 }, { x: 813, y: 376 }, { x: 816, y: 380 }, { x: 816, y: 390 }, { x: 817, y: 397 }, { x: 817, y: 397 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'izol_south', name: 'Izol south', points: [{ x: 812, y: 407 }, { x: 816, y: 408 }, { x: 820, y: 407 }, { x: 817, y: 403 }, { x: 817, y: 403 }, { x: 814, y: 402 }, { x: 812, y: 404 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'izol_north', name: 'Izol North', points: [{ x: 809, y: 330 }, { x: 809, y: 330 }, { x: 813, y: 325 }, { x: 813, y: 325 }, { x: 817, y: 327 }, { x: 821, y: 332 }, { x: 819, y: 337 }, { x: 816, y: 341 }, { x: 815, y: 345 }, { x: 812, y: 348 }, { x: 809, y: 349 }, { x: 806, y: 346 }, { x: 804, y: 343 }, { x: 801, y: 341 }, { x: 798, y: 339 }, { x: 798, y: 336 }, { x: 800, y: 333 }, { x: 802, y: 332 }, { x: 804, y: 331 }, { x: 806, y: 331 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'perth', name: 'Perth', points: [{ x: 716, y: 262 }, { x: 716, y: 262 }, { x: 722, y: 259 }, { x: 722, y: 259 }, { x: 726, y: 260 }, { x: 726, y: 260 }, { x: 729, y: 265 }, { x: 728, y: 272 }, { x: 728, y: 278 }, { x: 732, y: 281 }, { x: 737, y: 281 }, { x: 741, y: 276 }, { x: 742, y: 270 }, { x: 741, y: 266 }, { x: 738, y: 262 }, { x: 741, y: 260 }, { x: 737, y: 256 }, { x: 737, y: 256 }, { x: 737, y: 252 }, { x: 741, y: 250 }, { x: 745, y: 248 }, { x: 748, y: 245 }, { x: 750, y: 243 }, { x: 749, y: 240 }, { x: 749, y: 236 }, { x: 748, y: 233 }, { x: 747, y: 231 }, { x: 744, y: 230 }, { x: 741, y: 232 }, { x: 739, y: 230 }, { x: 736, y: 228 }, { x: 731, y: 229 }, { x: 728, y: 230 }, { x: 727, y: 236 }, { x: 722, y: 231 }, { x: 717, y: 231 }, { x: 713, y: 230 }, { x: 710, y: 229 }, { x: 704, y: 229 }, { x: 701, y: 230 }, { x: 696, y: 229 }, { x: 689, y: 228 }, { x: 685, y: 227 }, { x: 680, y: 222 }, { x: 679, y: 217 }, { x: 676, y: 212 }, { x: 671, y: 212 }, { x: 668, y: 208 }, { x: 666, y: 205 }, { x: 663, y: 204 }, { x: 659, y: 204 }, { x: 656, y: 203 }, { x: 654, y: 200 }, { x: 650, y: 200 }, { x: 647, y: 202 }, { x: 644, y: 204 }, { x: 644, y: 210 }, { x: 644, y: 214 }, { x: 645, y: 219 }, { x: 646, y: 222 }, { x: 645, y: 225 }, { x: 642, y: 226 }, { x: 643, y: 228 }, { x: 641, y: 230 }, { x: 640, y: 232 }, { x: 646, y: 240 }, { x: 649, y: 245 }, { x: 654, y: 245 }, { x: 657, y: 249 }, { x: 665, y: 252 }, { x: 671, y: 254 }, { x: 676, y: 257 }, { x: 680, y: 261 }, { x: 681, y: 262 }, { x: 687, y: 261 }, { x: 690, y: 263 }, { x: 696, y: 269 }, { x: 703, y: 268 }, { x: 708, y: 261 }, { x: 708, y: 261 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'perth_nord', name: 'Perth Nord', points: [{ x: 692, y: 199 }, { x: 695, y: 197 }, { x: 695, y: 194 }, { x: 697, y: 193 }, { x: 700, y: 192 }, { x: 702, y: 193 }, { x: 706, y: 196 }, { x: 709, y: 201 }, { x: 713, y: 200 }, { x: 708, y: 207 }, { x: 711, y: 211 }, { x: 710, y: 215 }, { x: 704, y: 220 }, { x: 698, y: 220 }, { x: 692, y: 220 }, { x: 687, y: 218 }, { x: 686, y: 212 }, { x: 687, y: 205 }, { x: 689, y: 199 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'grindavik', name: 'Grindavik', points: [{ x: 172, y: 338 }, { x: 175, y: 338 }, { x: 179, y: 341 }, { x: 183, y: 342 }, { x: 186, y: 345 }, { x: 188, y: 349 }, { x: 188, y: 354 }, { x: 186, y: 358 }, { x: 181, y: 359 }, { x: 177, y: 358 }, { x: 173, y: 358 }, { x: 170, y: 358 }, { x: 171, y: 354 }, { x: 169, y: 351 }, { x: 168, y: 348 }, { x: 169, y: 345 }, { x: 170, y: 344 }, { x: 170, y: 342 }, { x: 170, y: 342 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'grindavik_south', name: 'Grindavik south', points: [{ x: 180, y: 377 }, { x: 181, y: 375 }, { x: 182, y: 372 }, { x: 183, y: 370 }, { x: 185, y: 368 }, { x: 185, y: 366 }, { x: 184, y: 364 }, { x: 181, y: 362 }, { x: 178, y: 362 }, { x: 176, y: 364 }, { x: 173, y: 366 }, { x: 173, y: 371 }, { x: 173, y: 371 }, { x: 172, y: 373 }, { x: 172, y: 373 }, { x: 178, y: 373 }, { x: 178, y: 373 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'tokyo', name: 'Tokyo', points: [{ x: 454, y: 165 }, { x: 457, y: 163 }, { x: 461, y: 162 }, { x: 462, y: 163 }, { x: 461, y: 164 }, { x: 463, y: 165 }, { x: 465, y: 165 }, { x: 467, y: 161 }, { x: 465, y: 160 }, { x: 465, y: 160 }, { x: 466, y: 156 }, { x: 469, y: 156 }, { x: 473, y: 156 }, { x: 476, y: 155 }, { x: 477, y: 159 }, { x: 477, y: 162 }, { x: 479, y: 163 }, { x: 482, y: 159 }, { x: 483, y: 155 }, { x: 485, y: 152 }, { x: 487, y: 148 }, { x: 488, y: 147 }, { x: 485, y: 145 }, { x: 482, y: 149 }, { x: 480, y: 153 }, { x: 477, y: 152 }, { x: 478, y: 150 }, { x: 474, y: 148 }, { x: 460, y: 139 }, { x: 460, y: 139 }, { x: 459, y: 137 }, { x: 460, y: 136 }, { x: 460, y: 134 }, { x: 461, y: 132 }, { x: 464, y: 130 }, { x: 467, y: 129 }, { x: 467, y: 126 }, { x: 468, y: 121 }, { x: 468, y: 118 }, { x: 468, y: 115 }, { x: 466, y: 112 }, { x: 466, y: 109 }, { x: 465, y: 106 }, { x: 466, y: 104 }, { x: 469, y: 103 }, { x: 471, y: 102 }, { x: 471, y: 101 }, { x: 471, y: 99 }, { x: 473, y: 95 }, { x: 477, y: 94 }, { x: 479, y: 91 }, { x: 482, y: 87 }, { x: 481, y: 85 }, { x: 481, y: 83 }, { x: 479, y: 83 }, { x: 473, y: 85 }, { x: 473, y: 85 }, { x: 470, y: 84 }, { x: 468, y: 81 }, { x: 469, y: 79 }, { x: 473, y: 80 }, { x: 475, y: 80 }, { x: 479, y: 79 }, { x: 481, y: 78 }, { x: 485, y: 79 }, { x: 484, y: 84 }, { x: 487, y: 87 }, { x: 490, y: 87 }, { x: 491, y: 83 }, { x: 492, y: 80 }, { x: 496, y: 78 }, { x: 499, y: 76 }, { x: 501, y: 74 }, { x: 503, y: 71 }, { x: 504, y: 67 }, { x: 508, y: 64 }, { x: 512, y: 63 }, { x: 516, y: 61 }, { x: 517, y: 58 }, { x: 516, y: 56 }, { x: 515, y: 53 }, { x: 518, y: 52 }, { x: 520, y: 57 }, { x: 523, y: 54 }, { x: 526, y: 51 }, { x: 528, y: 51 }, { x: 531, y: 50 }, { x: 530, y: 47 }, { x: 529, y: 44 }, { x: 528, y: 40 }, { x: 524, y: 39 }, { x: 520, y: 38 }, { x: 516, y: 43 }, { x: 511, y: 44 }, { x: 504, y: 45 }, { x: 498, y: 45 }, { x: 493, y: 49 }, { x: 489, y: 52 }, { x: 486, y: 52 }, { x: 484, y: 51 }, { x: 481, y: 53 }, { x: 478, y: 55 }, { x: 475, y: 58 }, { x: 471, y: 62 }, { x: 468, y: 64 }, { x: 464, y: 66 }, { x: 462, y: 68 }, { x: 460, y: 71 }, { x: 459, y: 75 }, { x: 457, y: 82 }, { x: 453, y: 84 }, { x: 453, y: 84 }, { x: 455, y: 88 }, { x: 455, y: 88 }, { x: 450, y: 93 }, { x: 450, y: 93 }, { x: 446, y: 97 }, { x: 448, y: 102 }, { x: 451, y: 103 }, { x: 454, y: 104 }, { x: 454, y: 108 }, { x: 457, y: 112 }, { x: 458, y: 114 }, { x: 457, y: 116 }, { x: 456, y: 118 }, { x: 454, y: 114 }, { x: 451, y: 109 }, { x: 450, y: 106 }, { x: 446, y: 106 }, { x: 447, y: 110 }, { x: 448, y: 112 }, { x: 449, y: 114 }, { x: 448, y: 116 }, { x: 446, y: 118 }, { x: 444, y: 119 }, { x: 442, y: 120 }, { x: 440, y: 121 }, { x: 439, y: 124 }, { x: 437, y: 129 }, { x: 437, y: 129 }, { x: 436, y: 134 }, { x: 436, y: 134 }, { x: 439, y: 139 }, { x: 442, y: 139 }, { x: 445, y: 138 }, { x: 448, y: 141 }, { x: 446, y: 145 }, { x: 444, y: 150 }, { x: 444, y: 150 }, { x: 444, y: 153 }, { x: 446, y: 156 }, { x: 448, y: 158 }, { x: 451, y: 159 }, { x: 453, y: 162 }, { x: 453, y: 162 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
  { id: 'tokyo_south', name: 'Tokyo south', points: [{ x: 429, y: 172 }, { x: 431, y: 168 }, { x: 432, y: 165 }, { x: 436, y: 168 }, { x: 439, y: 168 }, { x: 444, y: 172 }, { x: 447, y: 175 }, { x: 451, y: 178 }, { x: 458, y: 179 }, { x: 464, y: 182 }, { x: 470, y: 182 }, { x: 477, y: 183 }, { x: 484, y: 182 }, { x: 487, y: 179 }, { x: 494, y: 176 }, { x: 499, y: 175 }, { x: 506, y: 174 }, { x: 510, y: 179 }, { x: 510, y: 179 }, { x: 506, y: 180 }, { x: 501, y: 182 }, { x: 495, y: 182 }, { x: 491, y: 184 }, { x: 489, y: 186 }, { x: 484, y: 186 }, { x: 481, y: 185 }, { x: 476, y: 186 }, { x: 473, y: 186 }, { x: 470, y: 187 }, { x: 466, y: 188 }, { x: 462, y: 187 }, { x: 461, y: 185 }, { x: 455, y: 187 }, { x: 452, y: 189 }, { x: 449, y: 188 }, { x: 446, y: 189 }, { x: 442, y: 188 }, { x: 438, y: 186 }, { x: 434, y: 184 }, { x: 434, y: 181 }, { x: 432, y: 179 }, { x: 431, y: 177 }, { x: 429, y: 172 }], fill: '#4a7a5a', stroke: '#1a3d2a' },
];

export const DEFAULT_FIR_ZONES: FIRZone[] = [
  { id: 'tokyo_fir', code: 'TOKYO', name: 'TOKYO FIR', points: [{ x: 589, y: 30 }, { x: 295, y: 29 }, { x: 295, y: 29 }, { x: 365, y: 268 }, { x: 389, y: 249 }, { x: 389, y: 249 }, { x: 588, y: 250 }, { x: 588, y: 250 }], color: 'rgba(255,200,0,0.15)', borderColor: '#ffc800' },
  { id: 'rockford_fir', code: 'ROCKFORD', name: 'ROCKFORD FIR', points: [{ x: 327, y: 771 }, { x: 531, y: 771 }, { x: 530, y: 646 }, { x: 628, y: 601 }, { x: 618, y: 552 }, { x: 618, y: 552 }, { x: 604, y: 497 }, { x: 603, y: 497 }, { x: 590, y: 469 }, { x: 681, y: 434 }, { x: 681, y: 434 }, { x: 697, y: 376 }, { x: 697, y: 376 }, { x: 650, y: 334 }, { x: 650, y: 334 }, { x: 626, y: 253 }, { x: 626, y: 253 }, { x: 626, y: 252 }, { x: 389, y: 251 }, { x: 389, y: 251 }, { x: 367, y: 269 }, { x: 367, y: 269 }, { x: 367, y: 269 }, { x: 328, y: 357 }, { x: 267, y: 416 }, { x: 267, y: 416 }, { x: 265, y: 574 }, { x: 327, y: 639 }, { x: 327, y: 639 }, { x: 327, y: 771 }], color: 'rgba(255,200,0,0.15)', borderColor: '#ffc800' },
  { id: 'izoliran_fir', code: 'IZOLIRAN', name: 'IZOLIRANI FIR', points: [{ x: 653, y: 334 }, { x: 702, y: 376 }, { x: 702, y: 376 }, { x: 685, y: 435 }, { x: 685, y: 435 }, { x: 592, y: 471 }, { x: 592, y: 471 }, { x: 619, y: 551 }, { x: 619, y: 550 }, { x: 778, y: 514 }, { x: 778, y: 514 }, { x: 823, y: 558 }, { x: 1000, y: 595 }, { x: 1000, y: 595 }, { x: 998, y: 232 }, { x: 895, y: 229 }, { x: 895, y: 229 }, { x: 830, y: 261 }, { x: 830, y: 261 }, { x: 806, y: 291 }, { x: 806, y: 291 }, { x: 760, y: 311 }, { x: 760, y: 311 }, { x: 696, y: 310 }, { x: 696, y: 310 }], color: 'rgba(255,200,0,0.15)', borderColor: '#ffc800' },
  { id: 'cyprus_f_fir', code: 'CYPRUS F', name: 'Cyprus FIR', points: [{ x: 534, y: 772 }, { x: 532, y: 648 }, { x: 631, y: 604 }, { x: 625, y: 574 }, { x: 625, y: 574 }, { x: 622, y: 552 }, { x: 622, y: 552 }, { x: 778, y: 515 }, { x: 778, y: 515 }, { x: 822, y: 560 }, { x: 822, y: 560 }, { x: 1001, y: 597 }, { x: 1001, y: 597 }, { x: 1001, y: 777 }, { x: 1001, y: 777 }], color: 'rgba(255,200,0,0.15)', borderColor: '#ffc800' },
  { id: 'sauthemp_fir', code: 'SAUTHEMP', name: 'Sauthemptona FIR', points: [{ x: 34, y: 732 }, { x: 33, y: 732 }, { x: 324, y: 737 }, { x: 324, y: 737 }, { x: 324, y: 641 }, { x: 323, y: 641 }, { x: 261, y: 576 }, { x: 261, y: 576 }, { x: 261, y: 548 }, { x: 261, y: 548 }, { x: 152, y: 503 }, { x: 35, y: 489 }, { x: 34, y: 489 }], color: 'rgba(255,200,0,0.15)', borderColor: '#ffc800' },
  { id: 'grindavi_fir', code: 'GRINDAVI', name: 'Grindavik FIR', points: [{ x: 33, y: 484 }, { x: 33, y: 484 }, { x: 155, y: 499 }, { x: 155, y: 499 }, { x: 262, y: 545 }, { x: 262, y: 545 }, { x: 263, y: 417 }, { x: 325, y: 357 }, { x: 325, y: 357 }, { x: 362, y: 269 }, { x: 361, y: 269 }, { x: 293, y: 31 }, { x: 34, y: 31 }], color: 'rgba(255,200,0,0.15)', borderColor: '#ffc800' },
  { id: 'perth_fir', code: 'PERTH', name: 'Perth FIR', points: [{ x: 590, y: 30 }, { x: 590, y: 30 }, { x: 589, y: 250 }, { x: 628, y: 251 }, { x: 652, y: 334 }, { x: 698, y: 307 }, { x: 698, y: 307 }, { x: 698, y: 307 }, { x: 761, y: 309 }, { x: 761, y: 309 }, { x: 805, y: 289 }, { x: 829, y: 259 }, { x: 829, y: 259 }, { x: 897, y: 226 }, { x: 897, y: 226 }, { x: 999, y: 230 }, { x: 999, y: 230 }, { x: 998, y: 29 }, { x: 998, y: 29 }], color: 'rgba(255,200,0,0.15)', borderColor: '#ffc800' },
];

export const DEFAULT_WAYPOINTS: Waypoint[] = [
  { code: 'MOGTA', x: 43.2, y: 72 },
  { code: 'EXMOR', x: 38.1, y: 74.8 },
  { code: 'PEPUL', x: 46, y: 76.4 },
  { code: 'GODLU', x: 52.3, y: 75.1 },
  { code: 'LAZER', x: 56.7, y: 76.8 },
  { code: 'ODOKU', x: 48.6, y: 82.8 },
  { code: 'EMJAY', x: 40.5, y: 83.2 },
  { code: 'LOGAN', x: 36.6, y: 68.2 },
  /** IRFD départs / transition ouest — placés entre IRFD et LOGAN (route type ROCKFORD) */
  { code: 'DLREY', x: 46.85, y: 68.35 },
  { code: 'DAALE', x: 42.4, y: 68.28 },
  { code: 'BEANS', x: 30, y: 63.1 },
  { code: 'ICTAM', x: 40.8, y: 59.5 },
  { code: 'KUNAV', x: 44.3, y: 55.9 },
  { code: 'HAWFA', x: 45.6, y: 58.4 },
  { code: 'QUEEN', x: 50.1, y: 63.3 },
  { code: 'LAVNO', x: 54.3, y: 65.8 },
  { code: 'ATPEV', x: 57.6, y: 64.3 },
  { code: 'SETHR', x: 53.8, y: 57.3 },
  { code: 'KENED', x: 44.2, y: 50.1 },
  { code: 'BUCFA', x: 36.8, y: 55.9 },
  { code: 'SKYDV', x: 38.65, y: 50.2 },
  { code: 'SAWPE', x: 29.8, y: 58.1 },
  { code: 'SUNST', x: 29.9, y: 51 },
  { code: 'ENDER', x: 32.7, y: 46.8 },
  { code: 'JAMSI', x: 57.3, y: 69.1 },
  { code: 'REAPR', x: 49.5, y: 92 },
  { code: 'TRELN', x: 42.9, y: 92.6 },
  { code: 'DEATH', x: 35.8, y: 93.9 },
  { code: 'GRASS', x: 65.1, y: 72.8 },
  { code: 'RENTS', x: 71, y: 69.2 },
  { code: 'FORIA', x: 56, y: 90.4 },
  { code: 'AQWRT', x: 62.7, y: 84.1 },
  { code: 'FORCE', x: 66.4, y: 97.2 },
  { code: 'MASEV', x: 72.3, y: 97.3 },
  { code: 'ALTRS', x: 78.5, y: 97.2 },
  { code: 'MUONE', x: 81.1, y: 90 },
  { code: 'JAZZR', x: 87.6, y: 90.1 },
  { code: 'NUBER', x: 94, y: 84.4 },
  { code: 'BOBUX', x: 81.9, y: 83 },
  { code: 'DEBUG', x: 87.9, y: 76.6 },
  { code: 'JACKI', x: 77.5, y: 77.2 },
  { code: 'ANYMS', x: 62.8, y: 65.4 },
  { code: 'CAWZE', x: 67.8, y: 56.3 },
  { code: 'CHAIN', x: 93.9, y: 67.6 },
  { code: 'JUSTY', x: 81, y: 64.7 },
  { code: 'BILLO', x: 87.8, y: 59.5 },
  { code: 'ABSRS', x: 93.9, y: 54.9 },
  { code: 'DOGGO', x: 79.2, y: 55.6 },
  { code: 'CYRIL', x: 71.7, y: 48.3 },
  { code: 'MORRD', x: 90.4, y: 45.9 },
  { code: 'CAMEL', x: 67.5, y: 41.4 },
  { code: 'DUNKS', x: 73.2, y: 41.7 },
  { code: 'ROSMO', x: 81.9, y: 38 },
  { code: 'UDMUG', x: 90.4, y: 33.3 },
  { code: 'LLIME', x: 93.7, y: 39.9 },
  { code: 'TALIS', x: 71.4, y: 36.9 },
  { code: 'SISTA', x: 76.7, y: 35.7 },
  { code: 'NOONU', x: 74.1, y: 28.7 },
  { code: 'KELLA', x: 78.2, y: 29.1 },
  { code: 'ZESTA', x: 88.1, y: 24.2 },
  { code: 'SQUID', x: 80, y: 21.1 },
  { code: 'WAGON', x: 85.3, y: 17.6 },
  { code: 'WELLS', x: 70.4, y: 20.9 },
  { code: 'STRAX', x: 60.2, y: 30.8 },
  { code: 'TINDR', x: 59.1, y: 24.9 },
  { code: 'WOTAN', x: 76.1, y: 14.1 },
  { code: 'CRAZY', x: 67.6, y: 13.3 },
  { code: 'ALLRY', x: 55.9, y: 30.2 },
  { code: 'TUDEP', x: 39, y: 30 },
  { code: 'GULEG', x: 36.3, y: 25.6 },
  { code: 'PIPER', x: 42.8, y: 26.6 },
  { code: 'ONDER', x: 49.5, y: 28.7 },
  { code: 'KNIFE', x: 54.2, y: 27.1 },
  { code: 'HONDA', x: 54.3, y: 19 },
  { code: 'LETSE', x: 49.6, y: 16.4 },
  { code: 'CHILY', x: 55.9, y: 10.6 },
  { code: 'ASTRO', x: 40.9, y: 20.9 },
  { code: 'SHIBA', x: 39, y: 13.5 },
  { code: 'NIKON', x: 43.8, y: 8.8 },
  { code: 'SHELL', x: 33.5, y: 7.7 },
  { code: 'BULLY', x: 25, y: 16.4 },
  { code: 'EZYBD', x: 31.3, y: 43.2 },
  { code: 'YOUTH', x: 25.8, y: 38.6 },
  { code: 'BLANK', x: 32.4, y: 32.9 },
  { code: 'EURAD', x: 30.2, y: 26.8 },
  { code: 'BOBOS', x: 16.1, y: 30.6 },
  { code: 'THENR', x: 20.2, y: 34.5 },
  { code: 'FROOT', x: 20.2, y: 24.6 },
  { code: 'ACRES', x: 11.8, y: 36.7 },
  { code: 'UWAIS', x: 7.5, y: 41.8 },
  { code: 'FRANK', x: 8.2, y: 49.6 },
  { code: 'CELAR', x: 22, y: 53.1 },
  { code: 'SPACE', x: 22.3, y: 61.5 },
  { code: 'SHREK', x: 15.2, y: 59.6 },
  { code: 'THACC', x: 8.1, y: 58.7 },
  { code: 'HACKE', x: 5.4, y: 71.6 },
  { code: 'HECKS', x: 7.5, y: 78.1 },
  { code: 'PACKT', x: 12.9, y: 80.1 },
  { code: 'WASTE', x: 12.5, y: 88.7 },
  { code: 'STACK', x: 20.2, y: 83.7 },
  { code: 'HOGGS', x: 28.2, y: 87.7 },
  { code: 'ALDER', x: 29.3, y: 81.2 },
  { code: 'SEEKS', x: 22.5, y: 73.5 },
  { code: 'GEORG', x: 15.5, y: 70.3 },
  { code: 'WELSH', x: 40.9, y: 43.3 },
  { code: 'INDEX', x: 45.5, y: 47.4 },
  { code: 'GAVIN', x: 55.6, y: 49.9 },
  { code: 'OCEEN', x: 59.9, y: 53.7 },
  { code: 'SILVA', x: 64.9, y: 49.9 },
  { code: 'DINER', x: 53.7, y: 37.3 },
  { code: 'PROBE', x: 44.5, y: 36.7 },
  { code: 'RENDR', x: 41.1, y: 33.3 },
  { code: 'GERLD', x: 37.9, y: 34.2 },
  { code: 'JOOPY', x: 49.2, y: 33.1 },
];

export const DEFAULT_VORS: VorPoint[] = [
  { code: 'HME', freq: '112.20', x: 40, y: 12, name: 'Haneda' },
  { code: 'PER', freq: '115.43', x: 72, y: 18, name: 'Perth' },
  { code: 'GVK', freq: '112.32', x: 14, y: 40, name: 'Grindavik' },
  { code: 'SAU', freq: '115.35', x: 12, y: 66, name: 'Sauthemptona' },
  { code: 'MLR', freq: '114.75', x: 36, y: 53, name: 'Mellor' },
  { code: 'RFD', freq: '113.55', x: 44, y: 64, name: 'Rockford' },
  { code: 'BLA', freq: '117.45', x: 50, y: 56, name: 'Blades' },
  { code: 'TRN', freq: '113.10', x: 52, y: 76, name: 'Training' },
  { code: 'GRY', freq: '111.90', x: 36, y: 65, name: 'Garry' },
  { code: 'LCK', freq: '112.90', x: 74, y: 80, name: 'Larnaca' },
  { code: 'PFO', freq: '117.95', x: 84, y: 85, name: 'Paphos' },
  { code: 'NJF', freq: '112.45', x: 92, y: 44, name: 'Najaf' },
  { code: 'IZO', freq: '117.53', x: 88, y: 46, name: 'Izolirani' },
];

export function toSVG(pos: Point): Point {
  return { x: pos.x * 10.24, y: pos.y * 7.87 };
}

export function createDefaultCartographyDraft(): CartographyDraftData {
  return {
    positions: structuredClone(DEFAULT_POSITIONS),
    islands: structuredClone(DEFAULT_ISLANDS),
    firZones: structuredClone(DEFAULT_FIR_ZONES),
    waypoints: structuredClone(DEFAULT_WAYPOINTS),
    vors: structuredClone(DEFAULT_VORS),
  };
}

function formatPoint(point: Point) {
  return `{ x: ${Number(point.x.toFixed(1))}, y: ${Number(point.y.toFixed(1))} }`;
}

export function exportPositionsCode(positions: Record<string, Point>): string {
  const lines = Object.entries(positions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, pos]) => `  '${code}': { x: ${Number(pos.x.toFixed(1))}, y: ${Number(pos.y.toFixed(1))} },`);
  return `export const DEFAULT_POSITIONS: Record<string, Point> = {\n${lines.join('\n')}\n};`;
}

export function exportIslandsCode(islands: Island[]): string {
  const lines = islands.map((island) => {
    const pointsStr = island.points.map(formatPoint).join(', ');
    return `  { id: '${island.id}', name: '${island.name}', points: [${pointsStr}], fill: '${island.fill}', stroke: '${island.stroke}' },`;
  });
  return `export const DEFAULT_ISLANDS: Island[] = [\n${lines.join('\n')}\n];`;
}

export function exportFirZonesCode(firZones: FIRZone[]): string {
  const lines = firZones.map((fir) => {
    const pointsStr = fir.points.map(formatPoint).join(', ');
    return `  { id: '${fir.id}', code: '${fir.code}', name: '${fir.name}', points: [${pointsStr}], color: '${fir.color}', borderColor: '${fir.borderColor}' },`;
  });
  return `export const DEFAULT_FIR_ZONES: FIRZone[] = [\n${lines.join('\n')}\n];`;
}

export function exportWaypointsCode(waypoints: Waypoint[]): string {
  const lines = waypoints.map((waypoint) => `  { code: '${waypoint.code}', x: ${Number(waypoint.x.toFixed(1))}, y: ${Number(waypoint.y.toFixed(1))} },`);
  return `export const DEFAULT_WAYPOINTS: Waypoint[] = [\n${lines.join('\n')}\n];`;
}

export function exportVorsCode(vors: VorPoint[]): string {
  const lines = vors.map((vor) => `  { code: '${vor.code}', freq: '${vor.freq}', x: ${Number(vor.x.toFixed(1))}, y: ${Number(vor.y.toFixed(1))}, name: '${vor.name}' },`);
  return `export const DEFAULT_VORS: VorPoint[] = [\n${lines.join('\n')}\n];`;
}

export function buildCartographyExport(data: CartographyDraftData) {
  return {
    positions: exportPositionsCode(data.positions),
    islands: exportIslandsCode(data.islands),
    firZones: exportFirZonesCode(data.firZones),
    waypoints: exportWaypointsCode(data.waypoints),
    vors: exportVorsCode(data.vors),
  };
}
