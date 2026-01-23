import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { ICreateOrderRequest, IPayPalConfig } from 'ngx-paypal';
import { ToastrService } from 'ngx-toastr';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

import { Cart } from 'src/app/common/Cart';
import { CartDetail } from 'src/app/common/CartDetail';
import { ChatMessage } from 'src/app/common/ChatMessage';
import { District } from 'src/app/common/District';
import { Notification } from 'src/app/common/Notification';
import { Order } from 'src/app/common/Order';
import { Province } from 'src/app/common/Province';
import { Ward } from 'src/app/common/Ward';

import { CartService } from 'src/app/services/cart.service';
import { NotificationService } from 'src/app/services/notification.service';
import { OrderService } from 'src/app/services/order.service';
import { ProvinceService } from 'src/app/services/province.service';
import { SessionService } from 'src/app/services/session.service';
import { WebSocketService } from 'src/app/services/web-socket.service';

import Swal from 'sweetalert2';

@Component({
  selector: 'app-checkout',
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.css']
})
export class CheckoutComponent implements OnInit {

  cart!: Cart;
  cartDetails!: CartDetail[];

  discount!: number;
  amount!: number;
  amountReal!: number;
  amountPaypal!: number;

  postForm: FormGroup;

  provinces!: Province[];
  districts!: District[];
  wards!: Ward[];

  province!: Province;
  district!: District;
  ward!: Ward;

  provinceCode!: number;
  districtCode!: number;
  wardCode!: number;

  public payPalConfig?: IPayPalConfig;

  // ✅ custom checkout: Mua ngay / Mua các món đã chọn
  isCustomCheckout: boolean = false;

  constructor(
    private cartService: CartService,
    private toastr: ToastrService,
    private router: Router,
    private sessionService: SessionService,
    private orderService: OrderService,
    private location: ProvinceService,
    private webSocketService: WebSocketService,
    private notificationService: NotificationService
  ) {
    this.postForm = new FormGroup({
      phone: new FormControl(null, [Validators.required, Validators.pattern('(0)[0-9]{9}')]),
      number: new FormControl('', Validators.required),
    });
  }

  ngOnInit(): void {
    this.webSocketService.openWebSocket();

    this.router.events.subscribe((evt) => {
      if (evt instanceof NavigationEnd) window.scrollTo(0, 0);
    });

    this.resetMoney();

    // ✅ PayPal config dùng số tiền tại thời điểm click (createOrderOnClient đọc this.amountPaypal)
    this.initPayPalConfig();

    // --- Nhận data từ history.state (Mua ngay / Mua selected) ---
    const state = history.state;

    if (state && state.buyNowItem) {
      this.isCustomCheckout = true;
      const mock = this.createMockDetailFromBuyNow(state.buyNowItem);
      this.setupCheckoutView([mock]);
    } else if (state && state.checkoutItems && Array.isArray(state.checkoutItems)) {
      this.isCustomCheckout = true;
      this.setupCheckoutView(state.checkoutItems);
    } else {
      this.isCustomCheckout = false;
      this.loadCartCheckoutFromDB();
    }
    // -----------------------------------------------------------

    this.getProvinces();
  }

  private resetMoney() {
    this.discount = 0;
    this.amount = 0;
    this.amountReal = 0;
    this.amountPaypal = 0;
  }

  // ✅ Mua ngay thường truyền item dạng: { product, quantity, price? }
  private createMockDetailFromBuyNow(item: any): any {
    return {
      cartDetailId: 0,
      quantity: item.quantity,
      price: item.price ?? (item.product?.price * item.quantity),
      product: item.product
    };
  }

  // ✅ Chỉ setup UI hiển thị + tính tiền
  private setupCheckoutView(items: any[]) {
    const email = this.sessionService.getUser();
    this.cartService.getCart(email).subscribe({
      next: (data) => {
        this.cart = data as Cart;

        this.postForm = new FormGroup({
          phone: new FormControl(this.cart.phone, [Validators.required, Validators.pattern('(0)[0-9]{9}')]),
          number: new FormControl('', Validators.required),
        });

        this.cartDetails = items as CartDetail[];

        this.recalcMoneyFromDetails(this.cartDetails);
      },
      error: () => this.toastr.error('Lỗi server', 'Hệ thống')
    });
  }

  // ✅ Luồng cũ: lấy toàn bộ cart details từ DB
  private loadCartCheckoutFromDB() {
    const email = this.sessionService.getUser();

    this.cartService.getCart(email).subscribe({
      next: (data) => {
        this.cart = data as Cart;

        this.postForm = new FormGroup({
          phone: new FormControl(this.cart.phone, [Validators.required, Validators.pattern('(0)[0-9]{9}')]),
          number: new FormControl('', Validators.required),
        });

        this.cartService.getAllDetail(this.cart.cartId).subscribe({
          next: (dt) => {
            this.cartDetails = dt as CartDetail[];
            this.cartService.setLength(this.cartDetails.length);

            if (!this.cartDetails || this.cartDetails.length === 0) {
              this.router.navigate(['/']);
              this.toastr.info('Hãy chọn một vài sản phẩm rồi tiến hành thanh toán', 'Hệ thống');
              return;
            }

            this.recalcMoneyFromDetails(this.cartDetails);
          },
          error: () => this.toastr.error('Lỗi server', 'Hệ thống')
        });
      },
      error: () => this.toastr.error('Lỗi server', 'Hệ thống')
    });
  }

  private recalcMoneyFromDetails(details: CartDetail[]) {
    this.resetMoney();

    details.forEach((item: any) => {
      const qty = Number(item.quantity ?? 0);

      // amountReal = tổng theo giá gốc product.price
      const productPrice = Number(item.product?.price ?? 0);
      this.amountReal += productPrice * qty;

      // amount = tổng theo item.price (nếu có), fallback = product.price * qty
      const itemPrice = item.price != null ? Number(item.price) : (productPrice * qty);
      this.amount += itemPrice;
    });

    this.discount = this.amount - this.amountReal;
    if (this.discount < 0) this.discount = 0;

    // tỷ giá của bạn đang hard-code
    this.amountPaypal = (this.amount / 22727.5);
  }

  // =========================
  // ✅ CHECKOUT (PAYPAL / NORMAL)
  // =========================
  checkOut() {
    if (!this.postForm.valid) {
      this.toastr.error('Hãy nhập đầy đủ thông tin', 'Hệ thống');
      return;
    }

    if (!this.cartDetails || this.cartDetails.length === 0) {
      this.toastr.info('Hãy chọn một vài sản phẩm rồi tiến hành thanh toán', 'Hệ thống');
      return;
    }

    Swal.fire({
      title: 'Bạn có muốn đặt đơn hàng này?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      cancelButtonText: 'Không',
      confirmButtonText: 'Đặt'
    }).then((result) => {
      if (!result.isConfirmed) return;

      const email = this.sessionService.getUser();

      // update thông tin nhận hàng vào cart
      this.cart.address = this.postForm.value.number;
      this.cart.phone = this.postForm.value.phone;

      // ✅ nếu là custom checkout (mua ngay / mua selected) thì phải "đồng bộ" cartDetail trên DB
      const placeOrder$ = this.isCustomCheckout
        ? this.placeCustomOrderByRebuildingCartDetails(email)
        : this.placeNormalOrder(email);

      placeOrder$.subscribe({
        next: (order) => {
          this.sendMessage(order.ordersId);
          Swal.fire('Thành công!', 'Đơn hàng đã được đặt.', 'success');

          // tuỳ flow của bạn: về cart hay home
          this.router.navigate(['/cart']);
        },
        error: () => this.toastr.error('Lỗi server', 'Hệ thống')
      });
    });
  }

  // ✅ Luồng thường: updateCart → post order (backend lấy cartDetails từ DB)
  private placeNormalOrder(email: string): Observable<Order> {
    return this.cartService.updateCart(email, this.cart).pipe(
      switchMap((updated) => {
        this.cart = updated as Cart;
        return this.orderService.post(email, this.cart) as Observable<Order>;
      })
    );
  }

  /**
   * ✅ FIX CHÍNH CHO "MUA NGAY / MUA SELECTED":
   * - Lấy toàn bộ cartDetails hiện có trên DB
   * - Tách "items cần đặt" & "items còn lại"
   * - Xóa hết cartDetail trên DB
   * - Post lại đúng "items cần đặt"
   * - Tạo order (backend sẽ tạo đủ orderDetail)
   * - Khôi phục "items còn lại" vào cart (để không mất giỏ)
   */
  private placeCustomOrderByRebuildingCartDetails(email: string): Observable<Order> {
    return this.cartService.updateCart(email, this.cart).pipe(
      switchMap((updated) => {
        this.cart = updated as Cart;

        return this.cartService.getAllDetail(this.cart.cartId).pipe(
          map((db) => (db as CartDetail[]) ?? [])
        );
      }),
      switchMap((dbDetails) => {
        const selected = this.cartDetails ?? [];

        // items còn lại = dbDetails - selected (theo cartDetailId nếu có, fallback theo productId)
        const remaining = dbDetails.filter((d) => !this.isInSelected(d, selected));

        // 1) delete all current details in DB
        const deleteAll$ = dbDetails.length
          ? forkJoin(dbDetails.map(d => this.cartService.deleteDetail((d as any).cartDetailId).pipe(catchError(() => of(null)))))
          : of([]);

        return deleteAll$.pipe(
          // 2) post selected as new cartDetails in DB
          switchMap(() => {
            const postSelected$ = selected.length
              ? forkJoin(selected.map(s => this.cartService.postDetail(this.buildCartDetailPayload(s)).pipe(catchError(() => of(null)))))
              : of([]);

            return postSelected$;
          }),
          // 3) create order
          switchMap(() => this.orderService.post(email, this.cart) as Observable<Order>),
          // 4) restore remaining items back to cart (không chặn success của order nếu restore lỗi)
          switchMap((order) => {
            if (!remaining.length) return of(order);

            return forkJoin(
              remaining.map(r => this.cartService.postDetail(this.buildCartDetailPayload(r)).pipe(catchError(() => of(null))))
            ).pipe(map(() => order));
          })
        );
      })
    );
  }

  // ✅ so sánh xem dbDetail có nằm trong selected không
  private isInSelected(dbDetail: any, selected: any[]): boolean {
    const dbId = Number(dbDetail?.cartDetailId ?? 0);
    if (dbId > 0) {
      return selected.some(s => Number(s?.cartDetailId ?? 0) === dbId);
    }
    const dbProductId = Number(dbDetail?.product?.productId ?? dbDetail?.product?.id ?? 0);
    return selected.some(s => Number(s?.product?.productId ?? s?.product?.id ?? 0) === dbProductId);
  }

  // ✅ tạo payload CartDetail để POST lên API /api/cartDetail
  private buildCartDetailPayload(item: any): any {
    const qty = Number(item?.quantity ?? 1);
    const product = item?.product;

    const productPrice = Number(product?.price ?? 0);
    const price = item?.price != null ? Number(item.price) : (productPrice * qty);

    // Payload phổ biến: { cart, product, quantity, price }
    // Nếu backend của bạn yêu cầu field khác thì báo mình sửa theo đúng entity.
    return {
      cartDetailId: 0,
      cart: this.cart,
      product: product,
      quantity: qty,
      price: price
    };
  }

  // =========================
  // NOTIFY + ADDRESS
  // =========================
  sendMessage(id: number) {
    const chatMessage = new ChatMessage(this.cart.user.name, ' đã đặt một đơn hàng');
    this.notificationService.post(
      new Notification(0, this.cart.user.name + ' đã đặt một đơn hàng (' + id + ')')
    ).subscribe(() => {
      this.webSocketService.sendMessage(chatMessage);
    });
  }

  // =========================
  // LOCATION
  // =========================
  getProvinces() {
    this.location.getAllProvinces().subscribe(data => {
      this.provinces = data as Province[];
    });
  }

  getDistricts() {
    this.location.getDistricts(this.provinceCode).subscribe(data => {
      this.province = data as Province;
      this.districts = this.province.districts;
    });
  }

  getWards() {
    this.location.getWards(this.districtCode).subscribe(data => {
      this.district = data as District;
      this.wards = this.district.wards;
    });
  }

  getWard() {
    this.location.getWard(this.wardCode).subscribe(data => {
      this.ward = data as Ward;
    });
  }

  setProvinceCode(code: any) {
    this.provinceCode = code.value;
    this.getDistricts();
  }

  setDistrictCode(code: any) {
    this.districtCode = code.value;
    this.getWards();
  }

  setWardCode(code: any) {
    this.wardCode = code.value;
    this.getWard();
  }

  // =========================
  // PAYPAL
  // =========================
  private initPayPalConfig(): void {
    this.payPalConfig = {
      currency: 'USD',
      clientId: 'Af5ZEdGAlk3_OOp29nWn8_g717UNbdcbpiPIZOZgSH4Gdneqm_y_KVFiHgrIsKM0a2dhNBfFK8TIuoOG',
      createOrderOnClient: () => <ICreateOrderRequest>{
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: String((this.amountPaypal ?? 0).toFixed(2)),
          },
        }]
      },
      advanced: { commit: 'true' },
      style: {
        label: 'paypal',
        layout: 'vertical',
        color: 'blue',
        size: 'small',
        shape: 'rect',
      },
      onApprove: (data, actions) => {
        actions.order.get().then((details: any) => console.log('PayPal details', details));
      },
      onClientAuthorization: (data) => {
        console.log('onClientAuthorization', data);
        this.checkOut();
      },
      onCancel: (data, actions) => console.log('OnCancel', data, actions),
      onError: err => console.log('OnError', err),
      onClick: (data, actions) => console.log('onClick', data, actions),
    };
  }
}
