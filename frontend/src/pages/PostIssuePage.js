import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Shield, ArrowLeft, MapPin, Tag, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function PostIssuePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [cities, setCities] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    city: user?.city || '',
    budget_min: '',
    budget_max: '',
    urgency: 'normal'
  });

  useEffect(() => {
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    try {
      const [catRes, cityRes] = await Promise.all([
        axios.get(`${API_URL}/api/categories`),
        axios.get(`${API_URL}/api/cities`)
      ]);
      setCategories(catRes.data.categories || []);
      setCities(cityRes.data.cities || []);
    } catch (error) {
      console.error('Error fetching options:', error);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title || !formData.description || !formData.category || !formData.city) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        budget_min: formData.budget_min ? parseInt(formData.budget_min) : null,
        budget_max: formData.budget_max ? parseInt(formData.budget_max) : null
      };
      
      const response = await axios.post(`${API_URL}/api/issues`, payload);
      toast.success('Issue posted successfully!');
      navigate(`/issues/${response.data.issue_id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to post issue');
    } finally {
      setLoading(false);
    }
  };

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
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 md:px-8 max-w-3xl py-8">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6" data-testid="back-btn">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Post Your Issue</CardTitle>
            <p className="text-slate-500 mt-1">
              Describe your problem anonymously. Verified experts will send you consultation offers.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Title */}
              <div>
                <Label htmlFor="title">Issue Title *</Label>
                <Input
                  id="title"
                  placeholder="Brief summary of your issue"
                  value={formData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  className="mt-1.5"
                  data-testid="issue-title-input"
                />
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Provide details about your issue. Don't include any personal identifying information."
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  className="mt-1.5 min-h-[150px]"
                  data-testid="issue-description-input"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Your identity is protected. Avoid sharing personal details.
                </p>
              </div>

              {/* Category & City */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Category *</Label>
                  <Select value={formData.category} onValueChange={(v) => handleChange('category', v)}>
                    <SelectTrigger className="mt-1.5" data-testid="category-select">
                      <Tag className="w-4 h-4 mr-2 text-slate-400" />
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>City *</Label>
                  <Select value={formData.city} onValueChange={(v) => handleChange('city', v)}>
                    <SelectTrigger className="mt-1.5" data-testid="city-select">
                      <MapPin className="w-4 h-4 mr-2 text-slate-400" />
                      <SelectValue placeholder="Select city" />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map(city => (
                        <SelectItem key={city} value={city}>{city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Budget Range */}
              <div>
                <Label>Budget Range (Optional)</Label>
                <div className="grid grid-cols-2 gap-4 mt-1.5">
                  <Input
                    type="number"
                    placeholder="Min ₹"
                    value={formData.budget_min}
                    onChange={(e) => handleChange('budget_min', e.target.value)}
                    data-testid="budget-min-input"
                  />
                  <Input
                    type="number"
                    placeholder="Max ₹"
                    value={formData.budget_max}
                    onChange={(e) => handleChange('budget_max', e.target.value)}
                    data-testid="budget-max-input"
                  />
                </div>
              </div>

              {/* Urgency */}
              <div>
                <Label>Urgency Level</Label>
                <Select value={formData.urgency} onValueChange={(v) => handleChange('urgency', v)}>
                  <SelectTrigger className="mt-1.5" data-testid="urgency-select">
                    <Clock className="w-4 h-4 mr-2 text-slate-400" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low - Can wait a few days</SelectItem>
                    <SelectItem value="normal">Normal - Within a week</SelectItem>
                    <SelectItem value="high">High - Need help soon</SelectItem>
                    <SelectItem value="urgent">Urgent - Need help ASAP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Privacy Notice */}
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-teal-800">Your Privacy is Protected</h4>
                    <p className="text-sm text-teal-700 mt-1">
                      Your issue will be posted with your display alias "{user?.alias}". 
                      Experts will not see your real identity unless you choose to reveal it.
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-4">
                <Button type="submit" className="flex-1" disabled={loading} data-testid="submit-issue-btn">
                  {loading ? 'Posting...' : 'Post Issue'}
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
