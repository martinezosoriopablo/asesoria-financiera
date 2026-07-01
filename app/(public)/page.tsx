import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import Differentiators from "@/components/landing/Differentiators";
import ServiceCards from "@/components/landing/ServiceCards";
import IASection from "@/components/landing/IASection";
import HowItWorks from "@/components/landing/HowItWorks";
import PortalPreview from "@/components/landing/PortalPreview";
import Footer from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div style={{ background: "#05162C", color: "#EEF3FA", fontFamily: "var(--font-body)" }}>
      <Navbar />
      <Hero />
      <Differentiators />
      <ServiceCards />
      <IASection />
      <HowItWorks />
      <PortalPreview />
      <Footer />
    </div>
  );
}
