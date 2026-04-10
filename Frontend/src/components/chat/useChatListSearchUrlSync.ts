import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

export function useChatListSearchUrlSync(
  urlQuery: string,
  skipUrlSyncRef: MutableRefObject<boolean>,
  setSearchInput: Dispatch<SetStateAction<string>>
) {
  useEffect(() => {
    if (skipUrlSyncRef.current) {
      skipUrlSyncRef.current = false;
      return;
    }
    setSearchInput(urlQuery);
  }, [urlQuery, skipUrlSyncRef, setSearchInput]);
}
