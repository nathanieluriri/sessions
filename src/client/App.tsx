import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { Toaster } from "./components/ui";
import { Contact, Home, Packages, Services } from "./pages/public";
import { BookCheckout, BookConfirmed, BookDetails, BookPackage, BookReview, BookService, BookTime, BookVerify, DemoPay } from "./pages/book";
import { ForgotPassword, Login, Register, ResetPassword, StaffLogin, VerifyEmail } from "./pages/auth";
import { AccountBooking, AccountBookings, AccountHome, AccountPayments, AccountProfile } from "./pages/account";
import { Admin } from "./pages/admin";
import { PageHero, PublicLayout } from "./components/Layout";

function ScrollTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

const Confirmed = () => <BookConfirmed id={useParams().id ?? ""} />;
const NotFound = () => <PublicLayout><PageHero title="Page not found." sub="The page you wanted is not here. Head back home or book a session." /></PublicLayout>;

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollTop />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/packages" element={<Packages />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/book" element={<BookService />} />
          <Route path="/book/package" element={<BookPackage />} />
          <Route path="/book/time" element={<BookTime />} />
          <Route path="/book/details" element={<BookDetails />} />
          <Route path="/book/review" element={<BookReview />} />
          <Route path="/book/checkout" element={<BookCheckout />} />
          <Route path="/book/verify" element={<BookVerify />} />
          <Route path="/book/confirmed/:id" element={<Confirmed />} />
          <Route path="/pay/demo" element={<DemoPay />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/staff/login" element={<StaffLogin />} />
          <Route path="/account" element={<AccountHome />} />
          <Route path="/account/bookings" element={<AccountBookings />} />
          <Route path="/account/bookings/:id" element={<AccountBooking />} />
          <Route path="/account/payments" element={<AccountPayments />} />
          <Route path="/account/profile" element={<AccountProfile />} />
          <Route path="/admin/:section?" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </AuthProvider>
  );
}
