import {createHash} from 'node:crypto';

export function evidenceSha256(bytes:Buffer):string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Validate without normalizing the supplied Unicode description. */
export function evidenceDescriptionError(mediaType:string, description:string):string|null {
  if(description.length>3000) return 'Evidence description must be 3000 characters or fewer';
  if(mediaType.startsWith('video/')&&description.trim().length<3) return 'Describe what you are demonstrating in the video';
  return null;
}
