import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Shield, User, Save, ArrowLeft, MapPin, Mail, Briefcase, Plus, X, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CATEGORIES = [
  { id: 'legal', name: 'Legal' },
  { id: 'medical', name: 'Medical' },
  { id: 'mental_health', name: 'Mental Health' },
  { id: 'career', name: 'Career' },
  { id: 'finance', name: 'Finance' },
  { id: 'relationships', name: 'Relationships' },
  { id: 'technology', name: 'Technology' },
  { id: 'education', name: 'Education' }
];

const CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai",
  "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Lucknow"
];

export default function ProfilePage() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [expertProfile, setExpertProfile] = useState(null);
  const [newExpertise, setNewExpertise] = useState('');
  const [newCity, setNewCity] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/users/profile`);
      setProfile(response.data);
      if (response.data.expert_profile) {
        setExpertProfile(response.data.expert_profile);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileChange = (field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const handleExpertProfileChange = (field, value) => {
    setExpertProfile(prev => ({ ...prev, [field]: value }));
  };

  const addExpertise = () => {
    if (newExpertise && !expertProfile.expertise.includes(newExpertise)) {
      setExpertProfile(prev => ({
        ...prev,
        expertise: [...prev.expertise, newExpertise]
      }));
      setNewExpertise('');
    }
  };

  const removeExpertise = (exp) => {
    setExpertProfile(prev => ({
      ...prev,
      expertise: prev.expertise.filter(e => e !== exp)
    }));
  };

  const addCity = () => {
    if (newCity && !expertProfile.cities.includes(newCity)) {
      setExpertProfile(prev => ({
        ...prev,
        cities: [...prev.cities, newCity]
      }));
      setNewCity('');
    }
  };

  const removeCity = (city) => {
    setExpertProfile(prev => ({
      ...prev,
      cities: prev.cities.filter(c => c !== city)
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update basic profile
      await axios.put(`${API_URL}/api/users/profile`, {
        alias: profile.alias,
        name: profile.name,
        city: profile.city
      });

      // Update expert profile if applicable
      if (user?.role === 'expert' && expertProfile) {
        await axios.put(`${API_URL}/api/users/expert-profile`, {
          bio: expertProfile.bio,
          expertise: expertProfile.expertise,
          experience_years: expertProfile.experience_years,
          hourly_rate: expertProfile.hourly_rate,
          cities: expertProfile.cities,
          whatsapp_number: expertProfile.whatsapp_number || ''
        });
      }

      updateUser(profile);
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse-soft text-lg text-slate-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
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

            <Button variant="ghost" onClick={() => navigate(-1)} data-testid="back-btn">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 md:px-8 max-w-3xl py-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-8" style={{ fontFamily: 'Outfit' }}>
          Profile Settings
        </h1>

        <div className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle style={{ fontFamily: 'Outfit' }}>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Display Alias</Label>
                  <Input
                    value={profile?.alias || ''}
                    onChange={(e) => handleProfileChange('alias', e.target.value)}
                    className="mt-1.5"
                    data-testid="alias-input"
                  />
                  <p className="text-xs text-slate-500 mt-1">This is how others see you</p>
                </div>
                <div>
                  <Label>Real Name (Optional)</Label>
                  <Input
                    value={profile?.name || ''}
                    onChange={(e) => handleProfileChange('name', e.target.value)}
                    className="mt-1.5"
                    data-testid="name-input"
                  />
                </div>
              </div>

              <div>
                <Label>Email</Label>
                <Input
                  value={profile?.email || ''}
                  disabled
                  className="mt-1.5 bg-slate-50"
                />
              </div>

              <div>
                <Label>City</Label>
                <Select value={profile?.city || ''} onValueChange={(v) => handleProfileChange('city', v)}>
                  <SelectTrigger className="mt-1.5" data-testid="city-select">
                    <MapPin className="w-4 h-4 mr-2 text-slate-400" />
                    <SelectValue placeholder="Select city" />
                  </SelectTrigger>
                  <SelectContent>
                    {CITIES.map(city => (
                      <SelectItem key={city} value={city}>{city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Expert Profile */}
          {user?.role === 'expert' && expertProfile && (
            <Card>
              <CardHeader>
                <CardTitle style={{ fontFamily: 'Outfit' }}>Expert Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Bio</Label>
                  <Textarea
                    value={expertProfile.bio || ''}
                    onChange={(e) => handleExpertProfileChange('bio', e.target.value)}
                    placeholder="Tell clients about your expertise and experience..."
                    className="mt-1.5 min-h-[100px]"
                    data-testid="bio-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Years of Experience</Label>
                    <Input
                      type="number"
                      value={expertProfile.experience_years || 0}
                      onChange={(e) => handleExpertProfileChange('experience_years', parseInt(e.target.value))}
                      className="mt-1.5"
                      data-testid="experience-input"
                    />
                  </div>
                  <div>
                    <Label>Hourly Rate (₹)</Label>
                    <Input
                      type="number"
                      value={expertProfile.hourly_rate || 500}
                      onChange={(e) => handleExpertProfileChange('hourly_rate', parseInt(e.target.value))}
                      className="mt-1.5"
                      data-testid="rate-input"
                    />
                  </div>
                </div>

                <div>
                  <Label>WhatsApp Number (with country code)</Label>
                  <Input
                    value={expertProfile.whatsapp_number || ''}
                    onChange={(e) => handleExpertProfileChange('whatsapp_number', e.target.value)}
                    placeholder="e.g. 919876543210"
                    className="mt-1.5"
                    data-testid="whatsapp-number-input"
                  />
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    Used for WhatsApp call handoff after you accept a client call request.
                  </p>
                </div>

                {/* Expertise */}
                <div>
                  <Label>Expertise Areas</Label>
                  <div className="flex flex-wrap gap-2 mt-2 mb-2">
                    {expertProfile.expertise?.map(exp => (
                      <Badge key={exp} variant="secondary" className="pr-1">
                        {exp}
                        <button onClick={() => removeExpertise(exp)} className="ml-1 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Select value={newExpertise} onValueChange={setNewExpertise}>
                      <SelectTrigger className="flex-1" data-testid="expertise-select">
                        <SelectValue placeholder="Add expertise" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.filter(c => !expertProfile.expertise?.includes(c.id)).map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={addExpertise} data-testid="add-expertise-btn">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Service Cities */}
                <div>
                  <Label>Service Cities</Label>
                  <div className="flex flex-wrap gap-2 mt-2 mb-2">
                    {expertProfile.cities?.map(city => (
                      <Badge key={city} variant="secondary" className="pr-1">
                        {city}
                        <button onClick={() => removeCity(city)} className="ml-1 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Select value={newCity} onValueChange={setNewCity}>
                      <SelectTrigger className="flex-1" data-testid="city-service-select">
                        <SelectValue placeholder="Add city" />
                      </SelectTrigger>
                      <SelectContent>
                        {CITIES.filter(c => !expertProfile.cities?.includes(c)).map(city => (
                          <SelectItem key={city} value={city}>{city}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={addCity} data-testid="add-city-btn">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Verification Status */}
                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">Verification Status</p>
                      <p className="text-sm text-slate-500">
                        {expertProfile.kyc_status === 'approved' 
                          ? 'Your profile is verified' 
                          : 'Complete your profile to get verified'}
                      </p>
                    </div>
                    <Badge className={expertProfile.is_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                      {expertProfile.kyc_status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={handleLogout} data-testid="logout-btn">
              Sign Out
            </Button>
            <Button onClick={handleSave} disabled={saving} data-testid="save-profile-btn">
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
