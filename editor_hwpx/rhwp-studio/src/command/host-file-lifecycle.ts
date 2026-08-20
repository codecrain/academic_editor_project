/**
 * 임베드된 Studio에서는 파일 수명주기를 호스트가 소유한다.
 *
 * 로컬 단독 실행에서는 이 목록을 차단하지 않는다. 호스트가 관리하는
 * 파일 목록과 Studio 내부의 로컬 파일/최근 문서 저장소가 서로 다른
 * 상태가 되는 것을 막기 위한 경계다.
 */
export const HOST_CONTROLLED_FILE_COMMANDS: ReadonlySet<string> = new Set([
  'file:new-doc',
  'file:open',
  'file:open-recent',
  'file:clear-recent',
  'file:save',
  'file:save-as-hwp',
  'file:save-as-hwpx',
]);

export function isHostControlledFileCommand(commandId: string): boolean {
  return HOST_CONTROLLED_FILE_COMMANDS.has(commandId);
}

export function isEmbeddedWindow(currentWindow: { parent: unknown }): boolean {
  return currentWindow.parent !== currentWindow;
}
