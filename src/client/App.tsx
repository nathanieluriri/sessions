import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { Toaster } from "./components/ui";
import { CookieBanner } from "./components/CookieBanner";

const account = () => import("./pages/account");
const AccountHome = lazy(() => account().then((m) => ({ default: m.AccountHome })));
const AccountBookings = lazy(() => account().then((m) => ({ default: m.AccountBookings })));
const AccountBooking = lazy(() => account().then((m) => ({ default: m.AccountBooking })));
const AccountPayments = lazy(() => account().then((m) => ({ default: m.AccountPayments })));
const AccountProfile = lazy(() => account().then((m) => ({ default: m.AccountProfile })));
const Admin = lazy(() => import("./pages/admin").then((m) => ({ default: m.Admin })));
import { Contact, Faq, Legal, Packages, Quote } from "./pages/public";
import { Services, ServiceDetail } from "./pages/services";
import { Studio } from "./pages/studio";
import { Portfolio } from "./pages/portfolio";
import { About } from "./pages/about";
import { Home } from "./pages/home";
import { BookCheckout, BookConfirmed, BookDetails, BookPackage, BookRequested, BookReview, BookService, BookTime, BookVerify, DemoPay, PayBooking } from "./pages/book";
import { ForgotPassword, Login, Register, ResetPassword, StaffLogin, VerifyEmail } from "./pages/auth";
import { Loading } from "./components/ui";
import { PublicLayout } from "./components/Layout";
import { TactileLink } from "./components/kitchen";
import { Badge } from "./components/pill";
import { NotFoundArt } from "./components/art";

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
    <section className="pagehero">
      <div className="wrap nfgrid">
        <div className="stack gap20" style={{ alignItems: "flex-start" }}>
          <Badge>Error 404</Badge>
          <h1 className="display" style={{ fontSize: "clamp(40px,5vw,68px)" }}>This page skipped a beat.</h1>
          <p className="muted" style={{ fontSize: 18, maxWidth: 520 }}>The page you wanted is not on this record. It may have moved, or the link has a typo.</p>
          <div className="row gap12 wrapflex"><TactileLink to="/" size="lg">Back to home</TactileLink><TactileLink to="/book" variant="light" size="lg">Book a session</TactileLink></div>
        </div>
        <NotFoundArt />
      </div>
    </section>
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
          <Route path="/cookies" element={<Legal slug="cookies" />} />
          <Route path="/book" element={<BookService />} />
          <Route path="/book/package" element={<BookPackage />} />
          <Route path="/book/time" element={<BookTime />} />
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
          <Route path="/account/payments" element={<AccountPayments />} />
          <Route path="/account/profile" element={<AccountProfile />} />
          <Route path="/admin/:section?" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        <Toaster />
        <CookieBanner />
      </BrowserRouter>
    </AuthProvider>
  );
}
