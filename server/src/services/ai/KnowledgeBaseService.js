/**
 * KnowledgeBaseService.js — Franchise Knowledge Base RAG Retriever
 * Fetches verified services, pricing, timings, policies, and FAQs
 */
const pool = require('../../config/db');

class KnowledgeBaseService {
  /**
   * Fetch relevant knowledge base entries for a given query and franchise
   * @param {number} franchiseId
   * @param {string} query
   * @returns {Promise<Array<{category: string, title: string, content: string}>>}
   */
  async getRelevantKnowledge(franchiseId = 1, query = '') {
    try {
      const lower = query.toLowerCase();

      // Retrieve all active knowledge base records for this franchise
      const [rows] = await pool.query(
        'SELECT category, title, content, keywords FROM franchise_knowledge_base WHERE franchise_id = ? AND is_active = 1',
        [franchiseId]
      );

      if (!rows.length) return [];

      // Rank records based on keyword matching
      const ranked = rows.map(item => {
        let score = 0;
        const keywords = (item.keywords || '').toLowerCase().split(',').map(k => k.trim());
        const titleLower = item.title.toLowerCase();

        for (const kw of keywords) {
          if (kw && lower.includes(kw)) score += 3;
        }
        if (lower.includes(item.category.toLowerCase())) score += 2;
        if (titleLower.split(' ').some(w => w.length > 3 && lower.includes(w))) score += 2;

        return { ...item, score };
      });

      // Filter and sort by score
      const matches = ranked
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score);

      // If no specific keyword match, return top 3 standard core articles (services + pricing + hours)
      if (matches.length === 0) {
        return rows.slice(0, 3);
      }

      return matches.slice(0, 4);
    } catch (err) {
      console.warn('[KnowledgeBaseService] Error retrieving knowledge:', err.message);
      return [];
    }
  }

  /**
   * Format knowledge articles into a context block for system prompt
   */
  formatContext(articles) {
    if (!articles || !articles.length) return 'No specific knowledge articles available.';
    return articles
      .map((a, i) => `[Knowledge Article #${i + 1} - ${a.title} (${a.category})]\n${a.content}`)
      .join('\n\n');
  }
}

module.exports = new KnowledgeBaseService();
