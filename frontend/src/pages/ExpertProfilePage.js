import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Shield, ArrowLeft, Star, MapPin, Calendar, Clock, MessageSquare, Check, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function ExpertProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [expert, setExpert] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExpert();
  }, [userId]);

  const fetchExpert = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/experts/${userId}`);
      setExpert(response.data);
    } catch (error) {
      console.error('Error fetching expert:', error);
      toast.error('Expert not found');
      navigate('/experts');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse-soft text-lg text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!expert) return null;

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

      <main className="container mx-auto px-4 md:px-8 max-w-5xl py-8">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6" data-testid="back-btn">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Card */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardContent className="p-6 text-center">
                <Avatar className="w-24 h-24 mx-auto mb-4">
                  <AvatarImage src={expert.user?.picture} />
                  <AvatarFallback className="text-2xl bg-slate-100">
                    {(expert.user?.name || expert.user?.alias || 'E')[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <h1 className="text-xl font-bold text-slate-900 mb-1" style={{ fontFamily: 'Outfit' }} data-testid="expert-name">
                  {expert.user?.name || expert.user?.alias}
                </h1>

                <div className="flex items-center justify-center gap-2 mb-4">
                  {expert.is_verified && (
                    <Badge className="bg-teal-100 text-teal-700">
                      <Check className="w-3 h-3 mr-1" /> Verified
                    </Badge>
                  )}
                  <div className="flex items-center gap-1 text-amber-500">
                    <Star className="w-4 h-4 fill-amber-400" />
                    <span className="font-medium">{expert.avg_rating?.toFixed(1) || 'New'}</span>
                    <span className="text-slate-400 text-sm">({expert.ratings_count || 0})</span>
                  </div>
                </div>

                <div className="space-y-3 text-sm text-slate-600 mb-6">
                  <div className="flex items-center justify-center gap-2">
                    <Briefcase className="w-4 h-4" />
                    <span>{expert.experience_years} years experience</span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{expert.total_consultations} consultations</span>
                  </div>
                  {expert.cities?.length > 0 && (
                    <div className="flex items-center justify-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span>{expert.cities.join(', ')}</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <div className="text-2xl font-bold text-teal-600 mb-1">
                    ₹{expert.hourly_rate}/session
                  </div>
                  <p className="text-xs text-slate-500">Starting price</p>
                </div>

                <Button className="w-full mt-4" onClick={() => navigate('/issues')} data-testid="post-issue-btn">
                  Post an Issue
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Bio */}
            <Card>
              <CardHeader>
                <CardTitle style={{ fontFamily: 'Outfit' }}>About</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600" data-testid="expert-bio">
                  {expert.bio || 'No bio provided yet.'}
                </p>
              </CardContent>
            </Card>

            {/* Expertise */}
            <Card>
              <CardHeader>
                <CardTitle style={{ fontFamily: 'Outfit' }}>Expertise</CardTitle>
              </CardHeader>
              <CardContent>
                {expert.expertise?.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {expert.expertise.map(exp => (
                      <Badge key={exp} variant="secondary" className="px-3 py-1">
                        {exp}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500">No expertise listed yet.</p>
                )}
              </CardContent>
            </Card>

            {/* Reviews */}
            <Card>
              <CardHeader>
                <CardTitle style={{ fontFamily: 'Outfit' }}>Reviews</CardTitle>
              </CardHeader>
              <CardContent>
                {!expert.recent_reviews || expert.recent_reviews.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No reviews yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {expert.recent_reviews.map(review => (
                      <div key={review.review_id} className="p-4 border border-slate-100 rounded-lg" data-testid={`review-${review.review_id}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star
                                key={star}
                                className={`w-4 h-4 ${star <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`}
                              />
                            ))}
                          </div>
                          <span className="text-sm text-slate-500">
                            {new Date(review.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-slate-600">{review.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
