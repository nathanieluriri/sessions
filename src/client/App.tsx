import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { Toaster } from "./components/ui";

const account = () => import("./pages/account");
const AccountHome = lazy(() => account().then((m) => ({ default: m.AccountHome })));
const AccountBookings = lazy(() => account().then((m) => ({ default: m.AccountBookings })));
const AccountBooking = lazy(() => account().then((m) => ({ default: m.AccountBooking })));
const AccountFiles = lazy(() => account().then((m) => ({ default: m.AccountFiles })));
const AccountPayments = lazy(() => account().then((m) => ({ default: m.AccountPayments })));
const AccountProfile = lazy(() => account().then((m) => ({ default: m.AccountProfile })));
const Admin = lazy(() => import("./pages/admin").then((m) => ({ default: m.Admin })));
import { Contact, Faq, Legal, Packages, Quote } from "./pages/public";
import { Services, ServiceDetail } from "./pages/services";
import { Studio } from "./pages/studio";
import { Portfolio } from "./pages/portfolio";
import { About } from "./pages/about";
import { Home } from "./pages/home";
import { BookCart, BookCheckout, BookConfirmed, BookDetails, BookPackage, BookRequested, BookReview, BookService, BookTime, BookVerify, DemoPay, PayBooking } from "./pages/book";
import { ForgotPassword, Login, Register, ResetPassword, StaffLogin, VerifyEmail } from "./pages/auth";
import { Loading } from "./components/ui";
import { PageHero, PublicLayout } from "./components/Layout";
import { TactileLink } from "./components/kitchen";

function ScrollTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return; }
    // Targets often render only after the page's data arrives, so keep looking for a few seconds.
    let tries = 0, t = 0;
    const find = () => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) el.scrollIntoView();
      else if (tries++ < 30) t = window.setTimeout(find, 100);
    };
    find();
    return () => window.clearTimeout(t);
  }, [pathname, hash]);
  return null;
}

const Confirmed = () => <BookConfirmed id={useParams().id ?? ""} />;
const NotFound = () => (
  <PublicLayout title="Page not found">
    <PageHero title="Page not found." sub="The page you wanted is not here. Head back home or book a session."><div><TactileLink to="/" size="lg">Back to home</TactileLink></div></PageHero>
  </PublicLayout>
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollTop />
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/services/:slug" element={<ServiceDetail />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/about" element={<About />} />
          <Route path="/packages" element={<Packages />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/quote" element={<Quote />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/privacy" element={<Legal slug="privacy" />} />
          <Route path="/terms" element={<Legal slug="terms" />} />
          <Route path="/book" element={<BookService />} />
          <Route path="/book/package" element={<BookPackage />} />
          <Route path="/book/time" element={<BookTime />} />
          <Route path="/book/cart" element={<BookCart />} />
          <Route path="/book/details" element={<BookDetails />} />
          <Route path="/book/review" element={<BookReview />} />
          <Route path="/book/checkout" element={<BookCheckout />} />
          <Route path="/book/requested/:id" element={<BookRequested />} />
          <Route path="/book/verify" element={<BookVerify />} />
          <Route path="/book/confirmed/:id" element={<Confirmed />} />
          <Route path="/pay/demo" element={<DemoPay />} />
          <Route path="/pay/:id" element={<PayBooking />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/staff/login" element={<StaffLogin />} />
          <Route path="/account" element={<AccountHome />} />
          <Route path="/account/bookings" element={<AccountBookings />} />
          <Route path="/account/bookings/:id" element={<AccountBooking />} />
          <Route path="/account/files" element={<AccountFiles />} />
          <Route path="/account/payments" element={<AccountPayments />} />
          <Route path="/account/profile" element={<AccountProfile />} />
          <Route path="/admin/:section?" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        <Toaster />
      </BrowserRouter>
    </AuthProvider>
  );
}
