import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';
import { Cart } from 'src/app/common/Cart';
import { CartDetail } from 'src/app/common/CartDetail';
import { CartService } from 'src/app/services/cart.service';
import { SessionService } from 'src/app/services/session.service';

@Component({
  selector: 'app-cart',
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.css']
})
export class CartComponent implements OnInit {

  cart!: Cart;
  cartDetail!: CartDetail;
  // Dùng any[] để có thể thêm thuộc tính 'selected' mà không cần sửa Model
  cartDetails: any[] = [];

  discount: number = 0;
  amount: number = 0;
  amountReal: number = 0;

  // Biến kiểm tra chọn tất cả
  checkAllState: boolean = false;

  constructor(
    private cartService: CartService,
    private toastr: ToastrService,
    private router: Router,
    private sessionService: SessionService) {
  }

  ngOnInit(): void {
    this.router.events.subscribe((evt) => {
      if (!(evt instanceof NavigationEnd)) {
        return;
      }
      window.scrollTo(0, 0)
    });
    this.getAllItem();
  }

  getAllItem() {
    let email = this.sessionService.getUser();
    this.cartService.getCart(email).subscribe(data => {
      this.cart = data as Cart;
      this.cartService.getAllDetail(this.cart.cartId).subscribe(data => {
        this.cartDetails = data as any[];

        // Mặc định chưa chọn sản phẩm nào
        this.cartDetails.forEach(item => item.selected = false);

        this.cartService.setLength(this.cartDetails.length);
        this.calculateTotal(); // Tính toán lại tiền (lúc này là 0)
      });
    });
  }

  update(id: number, quantity: number) {
    if (quantity < 1) {
      this.delete(id);
    } else {
      this.cartService.getOneDetail(id).subscribe(data => {
        this.cartDetail = data as CartDetail;
        this.cartDetail.quantity = quantity;
        this.cartDetail.price = (this.cartDetail.product.price * (1 - this.cartDetail.product.discount / 100)) * quantity;
        this.cartService.updateDetail(this.cartDetail).subscribe(data => {
          this.ngOnInit();
        }, error => {
          this.toastr.error('Lỗi!' + error.status, 'Hệ thống');
        })
      }, error => {
        this.toastr.error('Lỗi! ' + error.status, 'Hệ thống');
      })
    }
  }

  delete(id: number) {
    Swal.fire({
      title: 'Bạn muốn xoá sản phẩm này ra khỏi giỏ hàng?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      cancelButtonText: 'Không',
      confirmButtonText: 'Xoá'
    }).then((result) => {
      if (result.isConfirmed) {
        this.cartService.deleteDetail(id).subscribe(data => {
          this.toastr.success('Xoá thành công!', 'Hệ thống');
          this.ngOnInit();
        }, error => {
          this.toastr.error('Xoá thất bại! ' + error.status, 'Hệ thống');
        })
      }
    })
  }

  // --- LOGIC CHECKBOX & TÍNH TIỀN ---

  checkAll(event: any) {
    this.checkAllState = event.target.checked;
    this.cartDetails.forEach(item => {
      item.selected = this.checkAllState;
    });
    this.calculateTotal();
  }

  checkOne() {
    // Kiểm tra xem tất cả có được chọn không để update nút checkAll
    this.checkAllState = this.cartDetails.every(item => item.selected);
    this.calculateTotal();
  }

  calculateTotal() {
    this.amount = 0;
    this.amountReal = 0;
    this.discount = 0;

    // Chỉ tính tiền những món có selected = true
    this.cartDetails.forEach(item => {
      if (item.selected) {
        this.amountReal += item.product.price * item.quantity;
        this.amount += item.price;
      }
    });
    this.discount = this.amount - this.amountReal;
  }

  // --- CHUYỂN SANG CHECKOUT VỚI DANH SÁCH ĐÃ CHỌN ---
  checkOutSelected() {
    // Lọc ra các sản phẩm đã chọn
    const selectedItems = this.cartDetails.filter(item => item.selected);

    if (selectedItems.length === 0) {
      this.toastr.warning('Vui lòng chọn ít nhất 1 sản phẩm để thanh toán!', 'Hệ thống');
      return;
    }

    // Chuyển sang Checkout và gửi kèm danh sách hàng
    this.router.navigate(['/checkout'], {
      state: {
        checkoutItems: selectedItems
      }
    });
  }

}