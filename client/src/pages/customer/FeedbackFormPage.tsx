import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, MessageSquare, CheckCircle, ShieldAlert, Sparkles } from 'lucide-react';
import { useFeedbackFormContext, useSubmitFeedback } from '../../api/hooks/useFeedback';
import { PageTransition, AnimatedCard, RippleButton } from '../../components/ui/Animations';
import toast from 'react-hot-toast';

export default function FeedbackFormPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const { data: context, isLoading, isError, error } = useFeedbackFormContext(token);
  const alreadyDone = /already/i.test((error as any)?.response?.data?.error || '');
  const submitMutation = useSubmitFeedback();

  const [ratings, setRatings] = useState({
    overall_rating: 5,
    service_rating: 5,
    staff_rating: 5,
    cleanliness_rating: 5,
  });
  const [comments, setComments] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleRatingChange = (key: keyof typeof ratings, val: number) => {
    setRatings((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    submitMutation.mutate(
      {
        token,
        overall_rating: ratings.overall_rating,
        service_rating: ratings.service_rating,
        staff_rating: ratings.staff_rating,
        cleanliness_rating: ratings.cleanliness_rating,
        comments,
      },
      {
        onSuccess: () => {
          setSubmitted(true);
          toast.success('Thank you for your valuable feedback!');
        },
        onError: (err: any) => {
          toast.error(err.response?.data?.error || 'Failed to submit feedback');
        },
      }
    );
  };

  const renderStarSelector = (key: keyof typeof ratings, label: string) => {
    const currentVal = ratings[key];
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-gray-50 bg-gray-50/30">
        <span className="text-sm font-semibold text-gray-700 mb-2 sm:mb-0">{label}</span>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => handleRatingChange(key, star)}
              className="p-0.5 transition-transform hover:scale-110 focus:outline-none"
            >
              <Star
                size={22}
                className={
                  star <= currentVal
                    ? 'text-amber-400 fill-amber-400'
                    : 'text-gray-300 hover:text-amber-300'
                }
              />
            </button>
          ))}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500 font-medium">Loading feedback context...</p>
        </div>
      </div>
    );
  }

  if (alreadyDone) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <AnimatedCard className="bg-white p-8 rounded-2xl max-w-md w-full border border-gray-100 text-center shadow-sm">
          <CheckCircle size={48} className="text-emerald-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#0F172A]">Review completed</h3>
          <p className="text-sm text-gray-500 mt-2">Thank you! Your review for this visit is already saved.</p>
          <RippleButton variant="primary" onClick={() => navigate('/')} className="mt-6 w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl">Go to Home</RippleButton>
        </AnimatedCard>
      </div>
    );
  }

  if (isError || !context) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <AnimatedCard className="bg-white p-8 rounded-2xl max-w-md w-full border border-gray-100 text-center shadow-sm">
          <ShieldAlert size={48} className="text-blue-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#0F172A]">Invalid or Expired Link</h3>
          <p className="text-sm text-gray-500 mt-2">
            This feedback link is invalid, expired, or feedback has already been submitted for this visit.
          </p>
          <RippleButton
            variant="primary"
            onClick={() => navigate('/')}
            className="mt-6 w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl"
          >
            Go to Home
          </RippleButton>
        </AnimatedCard>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <AnimatedCard className="bg-white p-8 rounded-2xl max-w-md w-full border border-gray-100 text-center shadow-sm">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={36} className="text-emerald-500 animate-bounce" />
          </div>
          <h3 className="text-xl font-bold text-[#0F172A] flex items-center justify-center gap-1.5">
            Thank You! <Sparkles size={18} className="text-amber-500" />
          </h3>
          <p className="text-sm text-gray-500 mt-2">
            Your review has been saved. We constantly strive to improve our services based on your valuable inputs.
          </p>
          <RippleButton
            variant="primary"
            onClick={() => navigate('/')}
            className="mt-6 w-full bg-[#0F172A] hover:bg-black text-white rounded-xl"
          >
            Done
          </RippleButton>
        </AnimatedCard>
      </div>
    );
  }

  return (
    <PageTransition className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      <AnimatedCard className="bg-white p-6 sm:p-8 rounded-2xl max-w-lg w-full border border-gray-100 shadow-md">
        <div className="text-center mb-6">
          <div className="inline-flex p-3 bg-amber-50 text-amber-500 rounded-2xl mb-3">
            <MessageSquare size={28} />
          </div>
          <h2 className="text-xl font-bold text-[#0F172A]">Share Your Experience</h2>
          <p className="text-xs text-gray-400 mt-1">
            Hi {context.customer_name}, help us improve our wash standards!
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {renderStarSelector('overall_rating', 'Overall Satisfaction')}
          {renderStarSelector('service_rating', 'Wash & Service Quality')}
          {renderStarSelector('staff_rating', 'Staff Behavior / Politeness')}
          {renderStarSelector('cleanliness_rating', 'Outlet Cleanliness')}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Any specific comments or feedback?
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              placeholder="Tell us what you liked or how we can improve..."
            />
          </div>

          <RippleButton
            type="submit"
            variant="primary"
            disabled={submitMutation.isPending}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold py-2.5 shadow-sm"
          >
            {submitMutation.isPending ? 'Submitting...' : 'Submit Review'}
          </RippleButton>
        </form>
      </AnimatedCard>
    </PageTransition>
  );
}
