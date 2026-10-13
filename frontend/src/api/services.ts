import api from './axios';

/**
 * Uploads an image file directly to MinIO using a backend-generated presigned URL.
 * @param file The image File object to upload
 * @param type The type of image ('avatar', 'banner', 'thumbnail')
 * @returns The final public URL of the uploaded image
 */
export const uploadImageToS3 = async (file: File, type: 'avatar' | 'banner' | 'thumbnail'): Promise<string> => {
  // 1. Get Presigned URL from backend
  const initRes = await api.post('/upload/image/init', {
    type,
    contentType: file.type,
  });

  const { presignedUrl, publicUrl } = initRes.data;

  // 2. Upload directly to S3 (MinIO)
  // We use fetch here because axios might attach Authorization headers which S3 rejects
  const uploadRes = await fetch(presignedUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type,
    },
  });

  if (!uploadRes.ok) {
    throw new Error(`Failed to upload image to S3: ${uploadRes.statusText}`);
  }

  return publicUrl;
};

/**
 * Updates the current authenticated user's profile metadata.
 */
export const updateUserProfileApi = async (data: {
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
}) => {
  const response = await api.put('/users/me', data);
  return response.data;
};

/**
 * Updates video metadata.
 */
export const updateVideoApi = async (videoId: string, data: {
  title?: string;
  description?: string;
  category?: string;
  thumbnail_url?: string;
  tags?: string;
}) => {
  const response = await api.put(`/videos/${videoId}`, data);
  return response.data;
};

/**
 * Toggles subscription status to a channel.
 */
export const toggleSubscriptionApi = async (channelId: number) => {
  const response = await api.post(`/channels/${channelId}/subscribe`);
  return response.data;
};

/**
 * Records a view for a video to securely increment the view counter.
 */
export const recordVideoViewApi = async (videoId: number | string) => {
  const response = await api.post(`/metadata/videos/${videoId}/view`);
  return response.data;
};

/**
 * Gets a list of channels the logged-in user is subscribed to.
 */
export const getSubscribedChannelsApi = async () => {
  const response = await api.get('/channels/subscriptions');
  return response.data;
};

/**
 * Gets top-level comments and their replies for a video.
 */
export const getCommentsByVideoApi = async (videoId: number | string) => {
  const response = await api.get(`/videos/${videoId}/comments`);
  return response.data;
};

/**
 * Creates a new comment or reply.
 */
export const createCommentApi = async (videoId: number | string, content: string, parentId?: number) => {
  const response = await api.post(`/videos/${videoId}/comments`, {
    content,
    parent_id: parentId,
  });
  return response.data;
};

/**
 * Deletes a comment.
 */
export const deleteCommentApi = async (commentId: number | string) => {
  const response = await api.delete(`/comments/${commentId}`);
  return response.data;
};

/**
 * Toggles a like on a comment.
 */
export const toggleLikeCommentApi = async (commentId: number | string) => {
  const response = await api.post(`/comments/${commentId}/like`);
  return response.data;
};

/**
 * Toggles a like on a video.
 */
export const toggleLikeVideoApi = async (videoId: number | string) => {
  const response = await api.post(`/videos/${videoId}/like`);
  return response.data;
};

/**
 * Toggles a dislike on a video.
 */
export const toggleDislikeVideoApi = async (videoId: number | string) => {
  const response = await api.post(`/videos/${videoId}/dislike`);
  return response.data;
};

/**
 * Gets the current user's like/dislike status for a video.
 */
export const getVideoLikeStatusApi = async (videoId: number | string) => {
  const response = await api.get(`/videos/${videoId}/like_status`);
  return response.data;
};

