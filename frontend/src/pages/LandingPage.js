import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Users, MessageSquare, Star, ArrowRight, Check, Lock, Eye, Scale, Brain, Briefcase, PiggyBank } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

const EXPERT_IMAGES = [
  "https://images.unsplash.com/photo-1645066928295-2506defde470?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1736939678218-bd648b5ef3bb?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1772987057599-2f1088c1e993?w=400&h=400&fit=crop"
];

const CATEGORIES = [
  { id: 'legal', name: 'Legal', icon: Scale, color: 'bg-blue-50 text-blue-600' },
  { id: 'mental_health', name: 'Mental Health', icon: Brain, color: 'bg-purple-50 text-purple-600' },
  { id: 'career', name: 'Career', icon: Briefcase, color: 'bg-amber-50 text-amber-600' },
  { id: 'finance', name: 'Finance', icon: PiggyBank, color: 'bg-emerald-50 text-emerald-600' }
];

export default function LandingPage() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const getDashboardLink = () => {
    if (!user) return '/login';
    if (user.role === 'admin') return '/admin';
    if (user.role === 'expert') return '/expert';
    return '/dashboard';
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-slate-200/60">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-lg text-slate-900" style={{ fontFamily: 'Outfit' }}>
                ExpertOpinion
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              <Link to="/experts" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                Find Experts
              </Link>
              <Link to="/issues" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
                Browse Issues
              </Link>
            </div>

            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <Button onClick={() => navigate(getDashboardLink())} data-testid="dashboard-btn">
                  Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => navigate('/login')} data-testid="login-btn">
                    Sign In
                  </Button>
                  <Button onClick={() => navigate('/register')} data-testid="get-started-btn">
                    Get Started
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 md:pt-40 md:pb-32 mesh-bg">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fade-in">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 text-sm font-medium mb-6">
                <Lock className="w-3.5 h-3.5" />
                Your privacy is protected
              </div>
              
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] text-slate-900 mb-6" style={{ fontFamily: 'Outfit' }}>
                Expert advice,
                <br />
                <span className="text-gradient">anonymously.</span>
              </h1>
              
              <p className="text-lg md:text-xl text-slate-600 leading-relaxed mb-8 max-w-lg">
                Connect with verified professionals for confidential consultations. 
                Your identity stays protected until you choose to reveal it.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" onClick={() => navigate('/register')} className="h-12 px-8" data-testid="hero-get-started-btn">
                  Post Your Issue
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <Button size="lg" variant="outline" onClick={() => navigate('/experts')} className="h-12 px-8" data-testid="hero-browse-experts-btn">
                  Browse Experts
                </Button>
              </div>

              <div className="flex items-center gap-6 mt-10">
                <div className="flex -space-x-3">
                  {EXPERT_IMAGES.map((img, i) => (
                    <img 
                      key={i} 
                      src={img} 
                      alt="Expert" 
                      className="w-10 h-10 rounded-full border-2 border-white object-cover"
                    />
                  ))}
                </div>
                <div className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">500+</span> verified experts
                </div>
              </div>
            </div>

            <div className="relative hidden lg:block animate-fade-in stagger-2">
              <div className="absolute -top-8 -right-8 w-64 h-64 bg-teal-100/50 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-8 -left-8 w-48 h-48 bg-slate-100 rounded-full blur-3xl"></div>
              
              <div className="relative bg-white rounded-2xl border border-slate-100 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <Eye className="w-6 h-6 text-slate-400" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Anonymous User</p>
                    <p className="text-sm text-slate-500">Identity Protected</p>
                  </div>
                </div>
                
                <div className="bg-slate-50 rounded-xl p-4 mb-6">
                  <p className="text-slate-700 text-sm leading-relaxed">
                    "I need legal advice regarding a property dispute with a family member. 
                    Looking for an experienced lawyer who can help..."
                  </p>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">3 experts responded</span>
                  <span className="text-teal-600 font-medium">View offers →</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-20 bg-slate-50">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-slate-900 mb-4" style={{ fontFamily: 'Outfit' }}>
              Find the right expert
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Browse experts across multiple categories and find the perfect match for your needs
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {CATEGORIES.map((cat, i) => (
              <Link
                key={cat.id}
                to={`/experts?category=${cat.id}`}
                className="group bg-white rounded-xl border border-slate-100 p-6 card-hover animate-fade-in"
                style={{ animationDelay: `${i * 0.1}s` }}
                data-testid={`category-${cat.id}`}
              >
                <div className={`w-12 h-12 rounded-xl ${cat.color} flex items-center justify-center mb-4 transition-transform group-hover:scale-110`}>
                  <cat.icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">{cat.name}</h3>
                <p className="text-sm text-slate-500">Expert consultants</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-slate-900 mb-4" style={{ fontFamily: 'Outfit' }}>
              How it works
            </h2>
            <p className="text-lg text-slate-600">
              Simple, secure, and completely anonymous
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { 
                step: '01', 
                title: 'Post your issue', 
                desc: 'Describe your problem anonymously. Choose a category and city for targeted expert matching.',
                icon: MessageSquare
              },
              { 
                step: '02', 
                title: 'Receive offers', 
                desc: 'Verified experts review your issue and send consultation offers with pricing and availability.',
                icon: Users
              },
              { 
                step: '03', 
                title: 'Consult securely', 
                desc: 'Choose an expert, pay securely, and have your consultation via private chat.',
                icon: Shield
              }
            ].map((item, i) => (
              <div key={i} className="relative animate-fade-in" style={{ animationDelay: `${i * 0.15}s` }}>
                <div className="text-6xl font-bold text-slate-100 absolute -top-4 -left-2" style={{ fontFamily: 'Outfit' }}>
                  {item.step}
                </div>
                <div className="relative pt-8">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center mb-4">
                    <item.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-20 bg-slate-900 text-white">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-6" style={{ fontFamily: 'Outfit' }}>
                Built on trust
                <br />and privacy
              </h2>
              <p className="text-lg text-slate-300 leading-relaxed mb-8">
                Your anonymity is our priority. We use industry-standard encryption 
                and strict privacy policies to ensure your consultations remain confidential.
              </p>

              <div className="space-y-4">
                {[
                  'End-to-end encrypted conversations',
                  'Anonymous user identities by default',
                  'Verified expert credentials',
                  'Secure escrow payments'
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 animate-slide-in" style={{ animationDelay: `${i * 0.1}s` }}>
                    <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-slate-200">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { value: '10K+', label: 'Consultations' },
                { value: '500+', label: 'Verified Experts' },
                { value: '4.9', label: 'Average Rating' },
                { value: '15+', label: 'Cities' }
              ].map((stat, i) => (
                <div 
                  key={i} 
                  className="bg-slate-800 rounded-xl p-6 text-center animate-fade-in"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div className="text-3xl md:text-4xl font-bold text-white mb-1" style={{ fontFamily: 'Outfit' }}>
                    {stat.value}
                  </div>
                  <div className="text-sm text-slate-400">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 mesh-bg">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl text-center">
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-slate-900 mb-6" style={{ fontFamily: 'Outfit' }}>
            Ready to get expert advice?
          </h2>
          <p className="text-lg text-slate-600 mb-8 max-w-2xl mx-auto">
            Join thousands of users who have found the help they need while keeping their identity protected.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => navigate('/register')} className="h-12 px-8" data-testid="cta-client-btn">
              I need advice
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/register?role=expert')} className="h-12 px-8" data-testid="cta-expert-btn">
              I'm an expert
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-200">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-slate-900" style={{ fontFamily: 'Outfit' }}>
                ExpertOpinion
              </span>
            </div>
            <div className="text-sm text-slate-500">
              © 2024 ExpertOpinion. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
