import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { User as UserIcon, Heart, MessageSquare, Trash2 } from 'lucide-react';
import type { RootState } from '../store/store';
import {
  getCommentsByVideoApi,
  createCommentApi,
  deleteCommentApi,
  toggleLikeCommentApi,
} from '../api/services';

interface UserData {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
}

export interface CommentData {
  ID: number;
  CreatedAt: string;
  content: string;
  user_id: number;
  user: UserData;
  parent_id?: number;
  replies?: CommentData[];
  likes_count: number;
}

interface CommentsProps {
  videoId: number;
  videoOwnerId: number;
}

export default function Comments({ videoId, videoOwnerId }: CommentsProps) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);

  useEffect(() => {
    fetchComments();
  }, [videoId]);

  const fetchComments = async () => {
    try {
      const res = await getCommentsByVideoApi(videoId);
      setComments(res.comments || []);
    } catch (err) {
      console.error("Failed to load comments", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePostComment = async () => {
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await createCommentApi(videoId, newComment);
      setComments([res, ...comments]);
      setNewComment('');
    } catch (err) {
      console.error("Failed to post comment", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: number, parentId?: number) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;
    try {
      await deleteCommentApi(commentId);
      
      if (parentId) {
        // Update nested reply
        setComments(comments.map(c => {
          if (c.ID === parentId) {
            return { ...c, replies: (c.replies || []).filter(r => r.ID !== commentId) };
          }
          return c;
        }));
      } else {
        // Update top-level comment
        setComments(comments.filter(c => c.ID !== commentId));
      }
    } catch (err) {
      console.error("Failed to delete comment", err);
      alert("Failed to delete comment");
    }
  };

  const CommentItem = ({ comment, isReply = false, parentId = undefined }: { comment: CommentData, isReply?: boolean, parentId?: number }) => {
    const [liked, setLiked] = useState(false);
    const [likesCount, setLikesCount] = useState(comment.likes_count);
    const [showReplyBox, setShowReplyBox] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [submittingReply, setSubmittingReply] = useState(false);
    
    // In a real app we'd get the actual 'liked' status per user from the backend
    
    const canDelete = currentUser && (currentUser.id === comment.user_id || currentUser.id === videoOwnerId);

    const handleLike = async () => {
      if (!isAuthenticated) return alert("Please sign in to like comments");
      try {
        const res = await toggleLikeCommentApi(comment.ID);
        setLiked(res.liked);
        setLikesCount(res.likes_count);
      } catch (err) {
        console.error("Failed to like comment", err);
      }
    };

    const handlePostReply = async () => {
      if (!replyText.trim() || submittingReply) return;
      setSubmittingReply(true);
      try {
        const res = await createCommentApi(videoId, replyText, parentId || comment.ID);
        // Find parent and append reply
        setComments(comments.map(c => {
          if (c.ID === (parentId || comment.ID)) {
            return { ...c, replies: [...(c.replies || []), res] };
          }
          return c;
        }));
        setReplyText('');
        setShowReplyBox(false);
      } catch (err) {
        console.error("Failed to post reply", err);
      } finally {
        setSubmittingReply(false);
      }
    };

    const timeAgo = (dateStr: string) => {
      const days = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / (1000 * 3600 * 24));
      if (days === 0) return 'Today';
      if (days === 1) return '1 day ago';
      return `${days} days ago`;
    };

    return (
      <div className={`flex gap-4 ${isReply ? 'mt-4' : 'mt-6'}`}>
        <div className="shrink-0">
          {comment.user.avatar_url ? (
            <img src={comment.user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover bg-zinc-800" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-zinc-400" />
            </div>
          )}
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-white text-sm">
              {comment.user.display_name || comment.user.username}
            </span>
            <span className="text-xs text-zinc-500">{timeAgo(comment.CreatedAt)}</span>
          </div>
          
          <p className="text-zinc-300 text-sm whitespace-pre-wrap">{comment.content}</p>
          
          <div className="flex items-center gap-4 mt-2">
            <button 
              onClick={handleLike}
              className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${liked ? 'text-rose-500' : 'text-zinc-400 hover:text-white'}`}
            >
              <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
              {likesCount > 0 && likesCount}
            </button>
            
            {!isReply && (
              <button 
                onClick={() => setShowReplyBox(!showReplyBox)}
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Reply
              </button>
            )}
            
            {canDelete && (
              <button 
                onClick={() => handleDeleteComment(comment.ID, parentId)}
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-rose-500 transition-colors ml-auto"
                title={currentUser?.id === videoOwnerId ? "Delete as Channel Owner" : "Delete"}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {showReplyBox && (
            <div className="mt-3 flex gap-3">
              <div className="shrink-0">
                {currentUser?.avatar_url ? (
                  <img src={currentUser.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover bg-zinc-800" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                    <UserIcon className="w-4 h-4 text-zinc-400" />
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col items-end gap-2">
                <input 
                  type="text"
                  placeholder="Add a reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full bg-transparent border-b border-zinc-700 pb-1 text-sm text-white focus:outline-none focus:border-white transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && handlePostReply()}
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowReplyBox(false)} className="px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 rounded-full transition-colors">Cancel</button>
                  <button onClick={handlePostReply} disabled={!replyText.trim() || submittingReply} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-full hover:bg-blue-500 disabled:opacity-50 transition-colors">Reply</button>
                </div>
              </div>
            </div>
          )}

          {/* Render Replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-2">
              {comment.replies.map(reply => (
                <CommentItem key={reply.ID} comment={reply} isReply={true} parentId={comment.ID} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="animate-pulse flex gap-4 mt-8">
      <div className="w-10 h-10 bg-zinc-800 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-zinc-800 rounded w-1/4" />
        <div className="h-3 bg-zinc-800 rounded w-full" />
      </div>
    </div>;
  }

  return (
    <div className="mt-8 pt-8 border-t border-zinc-800">
      <h3 className="text-xl font-bold text-white mb-6">
        {comments.length} Comments
      </h3>

      {isAuthenticated ? (
        <div className="flex gap-4 mb-8">
          <div className="shrink-0">
            {currentUser?.avatar_url ? (
              <img src={currentUser.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover bg-zinc-800" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-zinc-400" />
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-col items-end gap-2">
            <textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="w-full bg-transparent border-b border-zinc-700 pb-2 text-white focus:outline-none focus:border-white transition-colors resize-none overflow-hidden"
              rows={1}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${target.scrollHeight}px`;
              }}
            />
            {newComment.trim() && (
              <button 
                onClick={handlePostComment}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-full text-sm transition-colors disabled:opacity-50"
              >
                Comment
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900/50 rounded-xl p-4 mb-8 border border-zinc-800 flex items-center justify-between">
          <p className="text-zinc-400 text-sm">Sign in to add a comment</p>
        </div>
      )}

      <div className="space-y-6">
        {comments.map(comment => (
          <CommentItem key={comment.ID} comment={comment} />
        ))}
      </div>
    </div>
  );
}
