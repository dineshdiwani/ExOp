import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Shield, Mail, Lock, User, ArrowRight, Eye, EyeOff, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai",
  "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Lucknow"
];

export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const defaultRole = searchParams.get('role') || 'client';
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    alias: '',
    name: '',
    city: '',
    role: defaultRole
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.alias) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const user = await register(formData);
      toast.success('Account created successfully!');
      
      // Navigate based on role
      if (user.role === 'expert') navigate('/expert');
      else navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = () => {
    loginWithGoogle();
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Link to="/" className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-lg text-slate-900" style={{ fontFamily: 'Outfit' }}>
              ExpertOpinion
            </span>
          </Link>

          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2" style={{ fontFamily: 'Outfit' }}>
            Create an account
          </h1>
          <p className="text-slate-600 mb-8">
            Join as a {formData.role === 'expert' ? 'verified expert' : 'client seeking advice'}
          </p>

          {/* Role Toggle */}
          <div className="flex p-1 bg-slate-100 rounded-lg mb-6">
            <button
              type="button"
              onClick={() => handleChange('role', 'client')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                formData.role === 'client' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
              data-testid="role-client-btn"
            >
              I need advice
            </button>
            <button
              type="button"
              onClick={() => handleChange('role', 'expert')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                formData.role === 'expert' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
              data-testid="role-expert-btn"
            >
              I'm an expert
            </button>
          </div>

          <Button 
            variant="outline" 
            className="w-full h-12 mb-6"
            onClick={handleGoogleSignup}
            data-testid="google-signup-btn"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </Button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-slate-500">or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="alias">Display Name *</Label>
                <div className="relative mt-1.5">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    id="alias"
                    placeholder="Your alias"
                    value={formData.alias}
                    onChange={(e) => handleChange('alias', e.target.value)}
                    className="pl-10 h-12"
                    data-testid="alias-input"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="name">Real Name (Optional)</Label>
                <Input
                  id="name"
                  placeholder="Your name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="h-12 mt-1.5"
                  data-testid="name-input"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="email">Email *</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="pl-10 h-12"
                  data-testid="email-input"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password">Password *</Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min 6 characters"
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  className="pl-10 pr-10 h-12"
                  data-testid="password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <Label>City</Label>
              <Select value={formData.city} onValueChange={(value) => handleChange('city', value)}>
                <SelectTrigger className="h-12 mt-1.5" data-testid="city-select">
                  <MapPin className="w-5 h-5 text-slate-400 mr-2" />
                  <SelectValue placeholder="Select your city" />
                </SelectTrigger>
                <SelectContent>
                  {CITIES.map(city => (
                    <SelectItem key={city} value={city}>{city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12" 
              disabled={loading}
              data-testid="register-submit-btn"
            >
              {loading ? 'Creating account...' : 'Create Account'}
              {!loading && <ArrowRight className="w-5 h-5 ml-2" />}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link to="/login" className="text-slate-900 font-medium hover:underline" data-testid="login-link">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Right Side - Image */}
      <div className="hidden lg:block lg:w-1/2 bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900"></div>
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="text-center text-white">
            <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-8 backdrop-blur">
              <Shield className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: 'Outfit' }}>
              {formData.role === 'expert' ? 'Share your expertise' : 'Get expert advice'}
            </h2>
            <p className="text-slate-300 max-w-sm mx-auto">
              {formData.role === 'expert' 
                ? 'Help others with your knowledge while earning. All consultations are secure and private.'
                : 'Connect with verified professionals for confidential consultations. Your identity stays protected.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
