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

  // Thêm cờ kiểm tra xem có phải mua ngay không
  isBuyNow: boolean = false;

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

    // --- LOGIC MỚI: KIỂM TRA MUA NGAY ---
    const state = history.state;
    if (state && state.buyNowItem) {
      this.isBuyNow = true;
      this.getBuyNowItem(state.buyNowItem);
    } else {
      this.isBuyNow = false;
      this.getAllItem();
    }
    // ------------------------------------

    this.getProvinces();
  }

  // Hàm xử lý dữ liệu Mua Ngay (Clone từ getAllItem nhưng sửa logic tính toán)
  getBuyNowItem(item: any) {
    let email = this.sessionService.getUser();
    // Vẫn gọi getCart để lấy thông tin User (Phone, Address, Name)
    this.cartService.getCart(email).subscribe(data => {
      this.cart = data as Cart;

      this.postForm = new FormGroup({
        'phone': new FormControl(this.cart.phone, [Validators.required, Validators.pattern('(0)[0-9]{9}')]),
        'number': new FormControl('', Validators.required),
      })

      // Ghi đè cartDetails bằng sản phẩm Mua Ngay
      // Tạo object giả lập CartDetail
      // Lưu ý: Cần ép kiểu hoặc tạo object sao cho khớp với model CartDetail của bạn
      const mockDetail: any = {
        cartDetailId: 0,
        quantity: item.quantity,
        price: item.price,
        product: item.product,
        cart: this.cart
      };

      this.cartDetails = [mockDetail];

      // Tính toán tiền
      this.amountReal = item.price * item.quantity;
      this.amount = this.amountReal; // Hoặc cộng thêm ship nếu có
      this.discount = 0; // Mua ngay thường tính giá đã giảm rồi nên discount hiển thị có thể để 0 hoặc tính lại tùy logic
      this.amountPaypal = (this.amount / 22727.5);
    });
  }

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

          // NẾU LÀ MUA NGAY: KHÔNG UPDATE GIỎ HÀNG VÀO DB
          if (this.isBuyNow) {
            // Cập nhật thông tin vào object cart hiện tại để gửi đi
            this.cart.address = this.postForm.value.number;
            this.cart.phone = this.postForm.value.phone;

            // Bạn có thể cần gán cartDetails vào cart nếu Server yêu cầu body có list item
            // this.cart.cartDetails = this.cartDetails; // (Nếu model Cart có thuộc tính này)

            this.orderService.post(email, this.cart).subscribe(data => {
              let order: Order = data as Order;
              this.sendMessage(order.ordersId);
              Swal.fire(
                'Thành công!',
                'Chúc mừng bạn đã đặt hàng thành công.',
                'success'
              )
              this.router.navigate(['/home']); // Mua ngay xong về Home, không về Cart
            }, error => {
              this.toastr.error('Lỗi server', 'Hệ thống');
            })

          } else {
            // LOGIC CŨ CHO GIỎ HÀNG
            this.cartService.getCart(email).subscribe(data => {
              this.cart = data as Cart;
              this.cart.address = this.postForm.value.number;
              this.cart.phone = this.postForm.value.phone;
              this.cartService.updateCart(email, this.cart).subscribe(data => {
                this.cart = data as Cart;
                this.orderService.post(email, this.cart).subscribe(data => {
                  let order: Order = data as Order;
                  this.sendMessage(order.ordersId);
                  Swal.fire(
                    'Thành công!',
                    'Chúc mừng bạn đã đặt hàng thành công.',
                    'success'
                  )
                  this.router.navigate(['/cart']);
                }, error => {
                  this.toastr.error('Lỗi server', 'Hệ thống');
                })
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
        console.log('onClientAuthorization - you should probably inform your server about completed transaction at this point', data);
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