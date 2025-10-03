export type Source = {
    sources: { url: string; quality: string }[];
    tracks: { url: string; lang: string; label: string }[];
    audio: { url: string; name: string; language: string }[];
    intro: {
      start: number;
      end: number;
    };
    outro: {
      start: number;
      end: number;
    };
    headers: { [key: string]: string };
};