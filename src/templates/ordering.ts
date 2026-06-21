/**
 * ERN 4.3 element ordering reference.
 *
 * In DDEX, child element order within a parent is significant — schema
 * validators reject out-of-order elements. The builder enforces these orders
 * structurally (by the order it emits nodes), but we also capture them here as
 * data: it documents intent, and the structural validator uses it to flag any
 * future regression where a child slips out of sequence.
 *
 * Each entry lists the canonical child order for a parent element. Optional and
 * repeatable children are included; absent children are simply skipped at build
 * time without disturbing the relative order of the rest.
 */

export const ERN_43_ELEMENT_ORDER: Record<string, readonly string[]> = {
  NewReleaseMessage: ['MessageHeader', 'PartyList', 'ResourceList', 'ReleaseList', 'DealList'],

  MessageHeader: [
    'MessageThreadId',
    'MessageId',
    'MessageFileName',
    'MessageSender',
    'SentOnBehalfOf',
    'MessageRecipient',
    'MessageCreatedDateTime',
    'MessageControlType',
  ],

  MessageSender: ['PartyId', 'PartyName'],
  MessageRecipient: ['PartyId', 'PartyName'],

  PartyList: ['Party'],
  Party: ['PartyReference', 'PartyName', 'PartyId'],
  PartyName: ['FullName', 'FullNameAsciiTranscribed', 'NamesBeforeKeyName', 'KeyName'],
  PartyId: ['DPID', 'ISNI', 'IPN', 'ProprietaryId'],

  ResourceList: ['SoundRecording', 'Image'],

  SoundRecording: [
    'ResourceReference',
    'Type',
    'ResourceId',
    'DisplayTitleText',
    'DisplayTitle',
    'DisplayArtistName',
    'DisplayArtist',
    'Contributor',
    'Duration',
    'ParentalWarningType',
    'SoundRecordingEdition',
  ],

  SoundRecordingEdition: ['Type', 'ResourceId', 'TechnicalDetails'],

  TechnicalDetails: [
    'TechnicalResourceDetailsReference',
    'AudioCodecType',
    'ImageCodecType',
    'NumberOfChannels',
    'SamplingRate',
    'BitsPerSample',
    'ImageHeight',
    'ImageWidth',
    'File',
  ],

  File: ['URI', 'HashSum'],
  HashSum: ['HashSum', 'HashSumAlgorithmType'],

  Image: ['ResourceReference', 'Type', 'ResourceId', 'TechnicalDetails'],

  DisplayArtist: ['ArtistPartyReference', 'DisplayArtistRole'],
  Contributor: ['ContributorPartyReference', 'Role'],

  ReleaseList: ['Release', 'TrackRelease'],

  Release: [
    'ReleaseReference',
    'ReleaseType',
    'ReleaseId',
    'DisplayTitleText',
    'DisplayTitle',
    'DisplayArtistName',
    'DisplayArtist',
    'ReleaseLabelReference',
    'Genre',
    'PLine',
    'CLine',
    'ParentalWarningType',
    'ReleaseResourceReferenceList',
    'ResourceGroup',
  ],

  ReleaseId: ['GRid', 'ICPN', 'ProprietaryId'],
  DisplayTitle: ['TitleText', 'SubTitle'],
  Genre: ['GenreText', 'SubGenre'],

  ResourceGroup: ['SequenceNumber', 'ResourceGroup', 'ResourceGroupContentItem'],
  ResourceGroupContentItem: ['SequenceNumber', 'ReleaseResourceReference'],

  DealList: ['ReleaseDeal'],
  ReleaseDeal: ['DealReleaseReference', 'Deal'],
  Deal: ['DealTerms'],
  DealTerms: [
    'CommercialModelType',
    'Usage',
    'TerritoryCode',
    'ExcludedTerritoryCode',
    'ValidityPeriod',
    'PriceInformation',
  ],
  Usage: ['UseType'],
  ValidityPeriod: ['StartDate', 'EndDate'],
  PriceInformation: ['WholesalePricePerUnit'],
} as const;

/**
 * Return the canonical index of `child` within `parent`'s element order, or -1
 * if the child is not part of the documented sequence.
 */
export function orderIndex(parent: string, child: string): number {
  const order = ERN_43_ELEMENT_ORDER[parent];
  if (!order) return -1;
  return order.indexOf(child);
}
