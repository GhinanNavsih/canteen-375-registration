export interface MenuItem {
  id: string;
  namaMenu: string;
  harga: number;
  category: string;
  imagePath: string;
  imageAspectRatio?: "1:1" | "3:4";
  isMakanan: boolean;
  isRecommended?: boolean;
  menuDescription?: string;
  sortOrder?: number;
  unitsPerPackage?: number;
  showMenu?: boolean;
}

export interface OptionItem {
  id?: string;
  name: string;
  additionalPrice: number;
  // Firebase may store price as priceAdjustment instead
  priceAdjustment?: number;
}

export interface OptionGroup {
  id: string;
  name: string;
  options: OptionItem[];
  selectionRule: 'required' | 'optional';
  ruleType: 'exactly' | 'at_least' | 'at_most'; // only relevant when required
  ruleCount: number;                              // how many the customer must pick
  linkedItemIds: string[];                        // IDs of MenuItems this group applies to
  linkedMenuItems?: string[];                     // Menu names this group applies to (from POS app)
}

export interface SelectedOption {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceAdjustment: number;
}

export interface BasketItem {
  cartItemId: string; // Unique ID to distinguish same menu item with different options
  menuItem: MenuItem;
  dineInQuantity: number;
  takeAwayQuantity: number;
  selectedOptions: SelectedOption[];
}

export interface SelfOrder {
  canteenId: string;
  customerNumber: number;
  namaCustomer: string;
  isMember: boolean;
  customerPhone: string;
  memberId: string;
  orderItems: {
    namaPesanan: string;
    dineInQuantity: number;
    takeAwayQuantity: number;
    harga: number;
    isMakanan: boolean;
    selectedOptions: SelectedOption[];
  }[];
  status: "Serving" | "Done" | "Cancelled";
  total: number;
  transactionMethod: string;
  waktuPengambilan: string;
  waktuPesan: any;
}
