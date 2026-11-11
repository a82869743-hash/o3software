import { useState } from 'react';
import { motion } from 'framer-motion';
import { Star, MessageSquare, ThumbsUp, ThumbsDown, BarChart3 } from 'lucide-react';
import { useFeedback, useFeedbackStats } from '../../api/hooks/useFeedback';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import PremiumStatCard from '../../components/shared/PremiumStatCard';
import { PageTransition, AnimatedCard, RippleButton, AnimatedModal } from '../../components/ui/Animations';

export default function FeedbackPage() {
  const { data: feedbackData, isLoading } = useFeedback();
  const { data: stats } = useFeedbackStats();


  const renderStars = (rating: number) =>
    Array.from({ length: 5 }, (_, i) => (
      <Star key={i} size={14} className={i < rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} />
    ));

  return (
    <PageTransition className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PremiumPageHeader title="Feedback & Reviews" subtitle="Customer satisfaction analytics" icon={Star} iconColor="#F59E0B" accentGradient="from-amber-500 to-amber-400" />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <PremiumStatCard title="Total Reviews" value={stats?.total_reviews || 0} icon={MessageSquare} color="#F59E0B" gradient="from-amber-500/10 to-amber-400/5" />
        <PremiumStatCard title="Average Rating" value={stats?.avg_rating || 0} suffix="/5" icon={Star} color="#F59E0B" delay={0.1} decimals={1} />
        <PremiumStatCard title="Positive" value={stats?.positive_count || 0} icon={ThumbsUp} color="#4CAF50" gradient="from-emerald-500/10 to-emerald-400/5" delay={0.2} />
        <PremiumStatCard title="Needs Attention" value={stats?.negative_count || 0} icon={ThumbsDown} color="#F44336" gradient="from-blue-500/10 to-blue-400/5" delay={0.3} />
      </div>

      {/* Rating Distribution */}
      {stats?.distribution && (
        <AnimatedCard className="bg-white rounded-2xl border border-gray-100 p-6 mb-8" delay={0.2}>
          <h3 className="text-lg font-bold text-[#0F172A] mb-4 flex items-center gap-2"><BarChart3 size={18} /> Rating Distribution</h3>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map(r => {
              const count = stats.distribution.find((d: any) => d.rating === r)?.count || 0;
              const pct = stats.total_reviews > 0 ? (count / stats.total_reviews) * 100 : 0;
              return (
                <div key={r} className="flex items-center gap-3">
                  <div className="flex items-center gap-1 w-16 text-sm text-gray-600">{r} <Star size={12} className="text-amber-400 fill-amber-400" /></div>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.3, duration: 0.8 }} className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500" />
                  </div>
                  <span className="text-xs font-semibold text-gray-500 w-10 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </AnimatedCard>
      )}

      {/* Reviews List */}
      <AnimatedCard className="bg-white rounded-2xl border border-gray-100 p-6" delay={0.3}>
        <h3 className="text-lg font-bold text-[#0F172A] mb-4">Recent Reviews</h3>
        <div className="space-y-4">
          {isLoading ? (
            [...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)
          ) : (feedbackData?.data || []).map((fb: any, i: number) => (
            <motion.div key={fb.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-[#0F172A]">{fb.customer_name || 'Customer'}</span>
                    <div className="flex">{renderStars(fb.rating)}</div>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{fb.review_text || 'No comment'}</p>
                  <p className="text-[11px] text-gray-400">{new Date(fb.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
              </div>
            </motion.div>
          ))}
          {!feedbackData?.data?.length && !isLoading && <p className="text-center text-gray-400 py-8 text-sm">No feedback yet</p>}
        </div>
      </AnimatedCard>

    </PageTransition>
  );
}
