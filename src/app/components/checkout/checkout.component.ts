import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { ICreateOrderRequest, IPayPalConfig } from 'ngx-paypal';
import { ToastrService } from 'ngx-toastr';
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
  cartDetail!: CartDetail;
  cartDetails!: CartDetail[];

  discount!: number;
  amount!: number;
  amountReal!: number;

  postForm: FormGroup;

  provinces!: Province[];
  districts!: District[];
  wards!: Ward[];

  province!: Province;
  district!: District;
  ward!: Ward;

  amountPaypal !: number;
  provinceCode!: number;
  districtCode!: number;
  wardCode!: number;
  public payPalConfig?: IPayPalConfig;

  // Cờ kiểm tra chế độ Checkout (Mua ngay / Mua từ giỏ hàng đã chọn)
  isCustomCheckout: boolean = false;

  constructor(
    private cartService: CartService,
    private toastr: ToastrService,
    private router: Router,
    private sessionService: SessionService,
    private orderService: OrderService,
    private location: ProvinceService,
    private webSocketService: WebSocketService,
    private notificationService: NotificationService) {
    this.postForm = new FormGroup({
      'phone': new FormControl(null, [Validators.required, Validators.pattern('(0)[0-9]{9}')]),
      'number': new FormControl('', Validators.required),
    })
  }

  ngOnInit(): void {
    this.checkOutPaypal();
    this.webSocketService.openWebSocket();
    this.router.events.subscribe((evt) => {
      if (!(evt instanceof NavigationEnd)) {
        return;
      }
      window.scrollTo(0, 0)
    });
    this.discount = 0;
    this.amount = 0;
    this.amountPaypal = 0;
    this.amountReal = 0;

    // --- LOGIC XỬ LÝ DỮ LIỆU ĐƯỢC TRUYỀN SANG ---
    const state = history.state;

    if (state && state.buyNowItem) {
      // Trường hợp 1: Mua Ngay (1 món từ trang chi tiết)
      this.isCustomCheckout = true;
      this.setupCustomCheckout([this.createMockDetail(state.buyNowItem)]);
    }
    else if (state && state.checkoutItems) {
      // Trường hợp 2: Mua từ Giỏ hàng (Các món đã chọn checkbox)
      this.isCustomCheckout = true;
      this.setupCustomCheckout(state.checkoutItems);
    }
    else {
      // Trường hợp 3: Fallback (ít khi xảy ra nếu làm đúng quy trình)
      this.isCustomCheckout = false;
      this.getAllItem();
    }
    // ----------------------------------------------

    this.getProvinces();
  }

  // Hàm tạo object chi tiết giả lập cho Mua Ngay
  createMockDetail(item: any): any {
    return {
      cartDetailId: 0,
      quantity: item.quantity,
      price: item.price,
      product: item.product
    };
  }

  // Hàm xử lý hiển thị cho các trường hợp Mua Ngay / Mua Selected
  setupCustomCheckout(items: any[]) {
    let email = this.sessionService.getUser();
    // Vẫn gọi getCart chỉ để lấy thông tin User (Tên, SĐT, Địa chỉ) để điền vào form
    this.cartService.getCart(email).subscribe(data => {
      this.cart = data as Cart;

      this.postForm = new FormGroup({
        'phone': new FormControl(this.cart.phone, [Validators.required, Validators.pattern('(0)[0-9]{9}')]),
        'number': new FormControl('', Validators.required),
      })

      // Gán danh sách sản phẩm từ state vào biến hiển thị
      this.cartDetails = items;

      // Tính toán tiền
      this.cartDetails.forEach(item => {
        this.amountReal += item.product.price * item.quantity;
        this.amount += (item.price ? item.price : (item.product.price * item.quantity)); // Fallback tính giá nếu thiếu
      });

      this.discount = this.amount - this.amountReal; // Có thể âm hoặc 0 tùy logic giá
      if (this.discount < 0) this.discount = 0;

      this.amountPaypal = (this.amount / 22727.5);
    });
  }

  // Logic cũ (Giữ lại để tham khảo hoặc fallback)
  getAllItem() {
    let email = this.sessionService.getUser();
    this.cartService.getCart(email).subscribe(data => {
      this.cart = data as Cart;
      this.postForm = new FormGroup({
        'phone': new FormControl(this.cart.phone, [Validators.required, Validators.pattern('(0)[0-9]{9}')]),
        'number': new FormControl('', Validators.required),
      })
      this.cartService.getAllDetail(this.cart.cartId).subscribe(data => {
        this.cartDetails = data as CartDetail[];
        this.cartService.setLength(this.cartDetails.length);
        if (this.cartDetails.length == 0) {
          this.router.navigate(['/']);
          this.toastr.info('Hãy chọn một vài sản phẩm rồi tiến hành thanh toán', 'Hệ thống');
        }
        this.cartDetails.forEach(item => {
          this.amountReal += item.product.price * item.quantity;
          this.amount += item.price;
        })
        this.discount = this.amount - this.amountReal;
        this.amountPaypal = (this.amount / 22727.5);
      });
    });
  }

  checkOut() {
    if (this.postForm.valid) {
      Swal.fire({
        title: 'Bạn có muốn đặt đơn hàng này?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        cancelButtonText: 'Không',
        confirmButtonText: 'Đặt'
      }).then((result) => {
        if (result.isConfirmed) {
          let email = this.sessionService.getUser();

          // Cập nhật thông tin nhận hàng vào object Cart hiện tại
          // Lưu ý: Đây là object Cart trên RAM, không nhất thiết phải trùng DB nếu là Custom Checkout
          this.cart.address = this.postForm.value.number;
          this.cart.phone = this.postForm.value.phone;

          if (this.isCustomCheckout) {

            this.cartService.updateCart(email, this.cart).subscribe(data => {
              this.cart = data as Cart;
              this.orderService.post(email, this.cart).subscribe(data => {
                let order: Order = data as Order;
                this.sendMessage(order.ordersId);

                Swal.fire('Thành công!', 'Đơn hàng đã được đặt.', 'success');
                this.router.navigate(['/home']);
              }, error => {
                this.toastr.error('Lỗi server', 'Hệ thống');
              })
            }, error => {
              this.toastr.error('Lỗi server', 'Hệ thống');
            })

          } else {
            // LOGIC CŨ (Mua tất cả trong giỏ)
            this.cartService.updateCart(email, this.cart).subscribe(data => {
              this.cart = data as Cart;
              this.orderService.post(email, this.cart).subscribe(data => {
                let order: Order = data as Order;
                this.sendMessage(order.ordersId);
                Swal.fire('Thành công!', 'Đơn hàng đã được đặt.', 'success');
                this.router.navigate(['/cart']);
              }, error => {
                this.toastr.error('Lỗi server', 'Hệ thống');
              })
            }, error => {
              this.toastr.error('Lỗi server', 'Hệ thống');
            })
          }
        }
      })
    } else {
      this.toastr.error('Hãy nhập đầy đủ thông tin', 'Hệ thống');
    }
  }

  sendMessage(id: number) {
    let chatMessage = new ChatMessage(this.cart.user.name, ' đã đặt một đơn hàng');
    this.notificationService.post(new Notification(0, this.cart.user.name + ' đã đặt một đơn hàng (' + id + ')')).subscribe(data => {
      this.webSocketService.sendMessage(chatMessage);
    })
  }

  getProvinces() {
    this.location.getAllProvinces().subscribe(data => {
      this.provinces = data as Province[];
    })
  }

  getDistricts() {
    this.location.getDistricts(this.provinceCode).subscribe(data => {
      this.province = data as Province;
      this.districts = this.province.districts;
    })
  }

  getWards() {
    this.location.getWards(this.districtCode).subscribe(data => {
      this.district = data as District;
      this.wards = this.district.wards;
    })
  }

  getWard() {
    this.location.getWard(this.wardCode).subscribe(data => {
      this.ward = data as Ward;
    })
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

  private checkOutPaypal(): void {
    this.payPalConfig = {
      currency: 'USD',
      clientId: 'Af5ZEdGAlk3_OOp29nWn8_g717UNbdcbpiPIZOZgSH4Gdneqm_y_KVFiHgrIsKM0a2dhNBfFK8TIuoOG',
      createOrderOnClient: (data) => <ICreateOrderRequest>{
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: String(this.amountPaypal.toFixed(2)),
          },
        }]
      },
      advanced: {
        commit: 'true'
      },
      style: {
        label: 'paypal',
        layout: 'vertical',
        color: 'blue',
        size: 'small',
        shape: 'rect',
      },
      onApprove: (data, actions) => {
        console.log('onApprove - transaction was approved, but not authorized', data, actions);
        actions.order.get().then((details: any) => {
          console.log('onApprove - you can get full order details inside onApprove: ', details);
        });
      },
      onClientAuthorization: (data) => {
        console.log('onClientAuthorization', data);
        this.checkOut();
      },
      onCancel: (data, actions) => {
        console.log('OnCancel', data, actions);
      },
      onError: err => {
        console.log('OnError', err);
      },
      onClick: (data, actions) => {
        console.log('onClick', data, actions);
      },
    };
  }
}