import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, FlatList, Image, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, Switch
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_RECIPIENT_EMAIL, DEFAULT_SENDER_EMAIL } from './src/constants';
import { loadOperations as loadStoredOperations, persistOperations } from './src/services/operations';
import { sendOperationByOutlook } from './src/services/mail';
import { removePhoto, storePhoto } from './src/services/photos';
import { Operation, OperationType, PhotoItem, Screen } from './src/types';

function AppContent() {
  const [screen, setScreen] = useState<Screen>('HOME');
  const [type, setType] = useState<OperationType>('RECEPTION');
  const [reference, setReference] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [reserved, setReserved] = useState(false);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [fullScreenPhoto, setFullScreenPhoto] = useState<PhotoItem | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => { void loadOperations(); }, []);

  async function loadOperations() {
    try {
      setOperations(await loadStoredOperations());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de charger l’historique local.';
      Alert.alert('Erreur', message);
    }
  }

  async function saveOperations(next: Operation[]) {
    setOperations(next);
    await persistOperations(next);
  }

  function startOperation(nextType: OperationType) {
    setType(nextType);
    setReference('');
    setPhotos([]);
    setReserved(false);
    setScreen('FORM');
  }

  async function startCamera() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Autorisation nécessaire', 'Autorisez l’accès à l’appareil photo dans les paramètres Android.');
        return;
      }
    }
    setScreen('CAMERA');
  }

  async function takePhoto() {
    try {
      const result = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
      if (!result?.uri) return;
      const item = await storePhoto(result.uri, reference, photos.length + 1);
      setPhotos(current => [...current, item]);
      setScreen('REVIEW');
    } catch {
      Alert.alert('Erreur', 'La photo n’a pas pu être enregistrée.');
    }
  }

  async function deletePhoto(index: number) {
    const item = photos[index];
    Alert.alert('Supprimer la photo ?', item.filename, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await removePhoto(item.uri);
        } catch {
          Alert.alert('Erreur', 'La photo n’a pas pu être supprimée du stockage.');
          return;
        }
        setPhotos(current => current.filter((_, i) => i !== index));
      }}
    ]);
  }

  async function saveOperation(status: Operation['status']) {
    if (!reference.trim()) {
      Alert.alert('Référence manquante', 'Saisissez un numéro UT ou de conteneur.');
      return;
    }
    const operation: Operation = {
      id: `${Date.now()}`, type, reference: reference.trim(),
      createdAt: new Date().toISOString(),
      photos,
      status,
      senderEmail: DEFAULT_SENDER_EMAIL,
      recipientEmail: DEFAULT_RECIPIENT_EMAIL,
      reserved: type === 'RECEPTION' && reserved,
    };
    const next = [operation, ...operations];
    await saveOperations(next);
    setSelectedOperation(operation);
    setScreen('DETAIL');
    if (status === 'EN_ATTENTE') {
      try {
        await sendOperationByOutlook(operation);
        const sentOperation = { ...operation, status: 'ENVOYE' as const };
        await saveOperations(next.map(item => item.id === operation.id ? sentOperation : item));
        setSelectedOperation(sentOperation);
        Alert.alert('Envoi confirmé', 'Le message a été accepté par Outlook et enregistré dans les éléments envoyés.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'L’envoi Outlook a échoué.';
        const failedOperation = { ...operation, status: 'ECHEC' as const, lastError: message };
        await saveOperations(next.map(item => item.id === operation.id ? failedOperation : item));
        setSelectedOperation(failedOperation);
        Alert.alert('Échec de l’envoi', `${message}\nLes photos restent conservées localement.`);
      }
    }
  }

  function Header({ title }: { title: string }) {
    return <View style={styles.header}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>✦</Text></View>
        <View>
          <Text style={styles.headerTitle}>SHT PHOTO</Text>
          <Text style={styles.headerEyebrow}>ESPACE TERRAIN</Text>
        </View>
      </View>
      <Text style={styles.headerSubtitle}>{title}</Text>
    </View>;
  }

  function Button({ title, onPress, secondary = false, disabled = false }: {
    title: string; onPress: () => void; secondary?: boolean; disabled?: boolean
  }) {
    return <TouchableOpacity disabled={disabled} onPress={onPress}
      style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabledButton]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{title}</Text>
    </TouchableOpacity>;
  }

  function BottomNavigation() {
    const items: { screen: Screen; label: string; icon: string }[] = [
      { screen: 'HOME', label: 'Accueil', icon: '⌂' },
      { screen: 'FORM', label: 'Nouveau', icon: '+' },
      { screen: 'HISTORY', label: 'Galerie', icon: '▦' },
      { screen: 'SETTINGS', label: 'Réglages', icon: '⚙' },
    ];

    return <View style={styles.bottomNavigation}>
      {items.map(item => <TouchableOpacity
        key={item.screen}
        style={styles.navItem}
        onPress={() => item.screen === 'FORM' ? startOperation('RECEPTION') : setScreen(item.screen)}
        accessibilityRole="button"
        accessibilityLabel={item.label}
      >
        <Text style={[styles.navIcon, screen === item.screen && styles.navActive]}>{item.icon}</Text>
        <Text style={[styles.navLabel, screen === item.screen && styles.navActive]}>{item.label}</Text>
      </TouchableOpacity>)}
    </View>;
  }

  if (screen === 'CAMERA') {
    return <SafeAreaView style={styles.cameraRoot}>
      <StatusBar style="light" />
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      <View style={styles.cameraTop}>
        <Text style={styles.cameraLabel}>{reference} · Photo {photos.length + 1}</Text>
        <Button title="Fermer" secondary onPress={() => setScreen('REVIEW')} />
      </View>
      <View style={styles.cameraBottom}>
        <TouchableOpacity style={styles.shutter} onPress={() => void takePhoto()}>
          <View style={styles.shutterInner} />
        </TouchableOpacity>
        <Text style={styles.cameraHint}>Appuyez pour prendre une photo</Text>
      </View>
    </SafeAreaView>;
  }

  return <SafeAreaView style={styles.root}>
    <StatusBar style="dark" />
    {screen === 'HOME' && <>
      <Header title="Bonjour, prêt pour le terrain ?" />
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeCopy}>
            <Text style={styles.welcomeEyebrow}>VOTRE JOURNÉE, EN IMAGES</Text>
            <Text style={styles.welcomeTitle}>Chaque détail compte.</Text>
            <Text style={styles.welcomeText}>Capturez, classez et partagez vos opérations en quelques gestes.</Text>
          </View>
          <View style={styles.welcomeIcon}><Text style={styles.welcomeEmoji}>📸</Text></View>
          <View style={styles.welcomeBubble} />
        </View>

        <View style={styles.sectionHeadingRow}>
          <View>
            <Text style={styles.heading}>Nouvelle opération</Text>
            <Text style={styles.muted}>Que souhaitez-vous documenter ?</Text>
          </View>
          <View style={styles.sparkle}><Text style={styles.sparkleText}>✦</Text></View>
        </View>

        <TouchableOpacity style={[styles.actionCard, styles.receptionCard]} onPress={() => startOperation('RECEPTION')} activeOpacity={0.88}>
          <View style={styles.actionIcon}><Text style={styles.actionEmoji}>📦</Text></View>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>Réception</Text>
            <Text style={styles.actionDescription}>Documenter l’arrivée des marchandises</Text>
            <Text style={styles.actionLink}>Démarrer  →</Text>
          </View>
          <Text style={styles.actionArrow}>↗</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionCard, styles.containerCard]} onPress={() => startOperation('CONTENEUR')} activeOpacity={0.88}>
          <View style={styles.actionIcon}><Text style={styles.actionEmoji}>🚢</Text></View>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>Chargement conteneur</Text>
            <Text style={styles.actionDescription}>Suivre et photographier le chargement</Text>
            <Text style={styles.actionLink}>Démarrer  →</Text>
          </View>
          <Text style={styles.actionArrow}>↗</Text>
        </TouchableOpacity>

        <View style={styles.sectionHeadingRow}>
          <View>
            <Text style={styles.heading}>Votre activité</Text>
            <Text style={styles.muted}>Retrouvez vos dernières opérations.</Text>
          </View>
          <TouchableOpacity onPress={() => setScreen('HISTORY')}><Text style={styles.seeAll}>Tout voir →</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.activityCard} onPress={() => setScreen('HISTORY')} activeOpacity={0.85}>
          <View style={styles.activityIcon}><Text style={styles.activityEmoji}>🗂️</Text></View>
          <View style={styles.activityCopy}>
            <Text style={styles.activityTitle}>Historique des opérations</Text>
            <Text style={styles.activitySubtitle}>Consulter vos dossiers enregistrés</Text>
          </View>
          <View style={styles.countBadge}><Text style={styles.countText}>{operations.length}</Text></View>
        </TouchableOpacity>
      </ScrollView>
    </>}

    {screen === 'FORM' && <>
      <Header title={type === 'RECEPTION' ? 'Réception de marchandises' : 'Chargement de conteneur'} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>{type === 'RECEPTION' ? 'Numéro UT' : 'Numéro du conteneur'}</Text>
        <TextInput value={reference} onChangeText={setReference}
          placeholder={type === 'RECEPTION' ? 'Ex. UT123456' : 'Ex. MSCU1234567'}
          autoCapitalize="characters" style={styles.input} />
        <Text style={styles.muted}>Expéditeur : {DEFAULT_SENDER_EMAIL}</Text>
        <Text style={styles.muted}>Récepteur : {DEFAULT_RECIPIENT_EMAIL}</Text>
        {type === 'RECEPTION' && <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.label}>Réserver cette réception</Text>
            <Text style={styles.muted}>Marquez l’opération comme réservée avant son enregistrement.</Text>
          </View>
          <Switch value={reserved} onValueChange={setReserved} />
        </View>}
        <Button title="Ouvrir l’appareil photo" disabled={!reference.trim()} onPress={() => void startCamera()} />
        <Button title={`Voir les photos (${photos.length})`} secondary onPress={() => setScreen('REVIEW')} />
        <Button title="Retour" secondary onPress={() => setScreen('HOME')} />
      </ScrollView>
    </>}

    {screen === 'REVIEW' && <>
      <Header title={`Photos · ${reference || 'Nouvelle opération'}`} />
      <View style={styles.reviewTop}>
        <Button title="＋ Prendre une photo" onPress={() => void startCamera()} />
      </View>
      {photos.length === 0 ? <Text style={styles.empty}>Aucune photo pour le moment.</Text> :
        <FlatList data={photos} keyExtractor={(item, index) => `${item.uri}-${index}`}
          numColumns={2} contentContainerStyle={styles.photoGrid}
          renderItem={({ item, index }) => <View style={styles.photoCard}>
            <TouchableOpacity onPress={() => setFullScreenPhoto(item)} accessibilityRole="button" accessibilityLabel="Voir la photo en grand">
              <Image source={{ uri: item.uri }} style={styles.photo} />
            </TouchableOpacity>
            <Text style={styles.photoName} numberOfLines={2}>{item.filename}</Text>
            <TouchableOpacity onPress={() => void deletePhoto(index)} style={styles.deleteButton}>
              <Text style={styles.deleteText}>Supprimer</Text>
            </TouchableOpacity>
          </View>} />}
      <View style={styles.bottomActions}>
        <Button title="Continuer vers l’aperçu" disabled={!photos.length} onPress={() => setScreen('PREVIEW')} />
        <Button title="Retour au formulaire" secondary onPress={() => setScreen('FORM')} />
      </View>
    </>}

    {screen === 'PREVIEW' && <>
      <Header title="Aperçu avant enregistrement" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.previewHero}>
          <Text style={styles.previewIcon}>✓</Text>
          <Text style={styles.previewTitle}>Vérifiez votre opération</Text>
          <Text style={styles.muted}>Les photos seront conservées localement sur ce téléphone.</Text>
        </View>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Type</Text>
            <Text style={styles.summaryValue}>{type === 'RECEPTION' ? 'Réception' : 'Conteneur'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Référence</Text>
            <Text style={styles.summaryValue}>{reference}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Photos</Text>
            <Text style={styles.summaryValue}>{photos.length} photo(s)</Text>
          </View>
          {type === 'RECEPTION' && <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Réservation</Text>
            <Text style={[styles.summaryValue, reserved && styles.reserved]}>{reserved ? 'Réservée' : 'Non réservée'}</Text>
          </View>}
        </View>
        <Text style={styles.label}>Aperçu des photos</Text>
        <View style={styles.previewGrid}>
          {photos.map((photo, index) => <TouchableOpacity key={`${photo.uri}-${index}`} onPress={() => setFullScreenPhoto(photo)} accessibilityRole="button" accessibilityLabel="Voir la photo en grand">
            <Image source={{ uri: photo.uri }} style={styles.previewImage} />
          </TouchableOpacity>)}
        </View>
        <Text style={styles.confirmationLabel}>Que souhaitez-vous faire ?</Text>
        <Button title="✉  Confirmer l’envoi par e-mail" onPress={() => void saveOperation('EN_ATTENTE')} />
        <Text style={styles.confirmationHint}>L’opération sera marquée « En attente d’envoi » et conservée sur le téléphone.</Text>
        <Button title="Enregistrer comme brouillon" secondary onPress={() => void saveOperation('BROUILLON')} />
        <Button title="Modifier les photos" secondary onPress={() => setScreen('REVIEW')} />
      </ScrollView>
    </>}

    {screen === 'HISTORY' && <>
      <Header title="Historique des opérations" />
      <View style={styles.searchContainer}>
        <TextInput
          value={historySearch}
          onChangeText={setHistorySearch}
          placeholder="Rechercher une référence ou un statut"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          autoCapitalize="none"
        />
      </View>
      <FlatList data={operations.filter(item => {
        const query = historySearch.trim().toLowerCase();
        if (!query) return true;
        const searchable = `${item.reference} ${item.type} ${item.status} ${item.reserved ? 'réservée' : ''}`.toLowerCase();
        return searchable.includes(query);
      })} keyExtractor={item => item.id}
        contentContainerStyle={styles.content}
        ListEmptyComponent={<Text style={styles.empty}>{historySearch ? 'Aucun résultat.' : 'Aucune opération enregistrée.'}</Text>}
        renderItem={({ item }) => <TouchableOpacity style={styles.historyCard}
          onPress={() => { setSelectedOperation(item); setScreen('DETAIL'); }}>
          <Text style={styles.historyTitle}>{item.reference}</Text>
          <Text style={styles.muted}>{item.type === 'RECEPTION' ? 'Réception' : 'Conteneur'} · {item.photos.length} photo(s)</Text>
          <Text style={styles.status}>{item.status === 'EN_ATTENTE' ? 'EN ATTENTE D’ENVOI' : item.reserved ? 'RÉSERVÉE' : 'BROUILLON'}{item.lastError ? ` — ${item.lastError}` : ''}</Text>
          <Text style={styles.muted}>{new Date(item.createdAt).toLocaleString()}</Text>
        </TouchableOpacity>} />
      <View style={styles.bottomActions}><Button title="Retour à l’accueil" secondary onPress={() => setScreen('HOME')} /></View>
    </>}

    {screen === 'DETAIL' && selectedOperation && <>
      <Header title="Détail de l’opération" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>{selectedOperation.reference}</Text>
        <Text style={styles.muted}>{selectedOperation.type === 'RECEPTION' ? 'Réception de marchandises' : 'Chargement de conteneur'}</Text>
        <Text style={styles.label}>Statut : {selectedOperation.status === 'EN_ATTENTE' ? 'En attente d’envoi' : 'Brouillon local'}</Text>
        <Text style={styles.muted}>Date : {new Date(selectedOperation.createdAt).toLocaleString()}</Text>
        <Text style={styles.muted}>Expéditeur : {selectedOperation.senderEmail}</Text>
        <Text style={styles.muted}>Récepteur : {selectedOperation.recipientEmail}</Text>
        {selectedOperation.reserved && <Text style={styles.reserved}>Réception réservée</Text>}
        <Text style={styles.muted}>Photos : {selectedOperation.photos.length}</Text>
        {selectedOperation.lastError ? <Text style={styles.error}>{selectedOperation.lastError}</Text> : null}
        {selectedOperation.photos.map((p, i) => <View key={`${p.uri}-${i}`} style={styles.detailPhoto}>
          <TouchableOpacity onPress={() => setFullScreenPhoto(p)} accessibilityRole="button" accessibilityLabel="Voir la photo en grand">
            <Image source={{ uri: p.uri }} style={styles.detailImage} />
          </TouchableOpacity>
          <Text style={styles.photoName}>{p.filename}</Text>
        </View>)}
        <Button title="Retour à l’historique" secondary onPress={() => setScreen('HISTORY')} />
      </ScrollView>
    </>}
    {screen === 'SETTINGS' && <>
      <Header title="Réglages" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Configuration</Text>
        <Text style={styles.muted}>Ces adresses sont définies dans le fichier .env et servent de valeurs par défaut pour les opérations.</Text>
        <View style={styles.settingCard}>
          <Text style={styles.settingLabel}>Adresse expéditeur</Text>
          <Text style={styles.settingValue}>{DEFAULT_SENDER_EMAIL}</Text>
        </View>
        <View style={styles.settingCard}>
          <Text style={styles.settingLabel}>Adresse récepteur</Text>
          <Text style={styles.settingValue}>{DEFAULT_RECIPIENT_EMAIL}</Text>
        </View>
        <Text style={styles.sectionCaption}>Stockage</Text>
        <Text style={styles.muted}>Les photos et les opérations sont conservées dans le stockage privé de l’application.</Text>
      </ScrollView>
    </>}
    <BottomNavigation />
    {fullScreenPhoto && <View style={styles.photoViewer}>
      <TouchableOpacity
        style={styles.photoViewerClose}
        onPress={() => setFullScreenPhoto(null)}
        accessibilityRole="button"
        accessibilityLabel="Fermer la photo"
      >
        <Text style={styles.photoViewerCloseText}>×</Text>
      </TouchableOpacity>
      <Image source={{ uri: fullScreenPhoto.uri }} style={styles.fullScreenImage} resizeMode="contain" />
      <Text style={styles.photoViewerName}>{fullScreenPhoto.filename}</Text>
    </View>}
  </SafeAreaView>;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FC' },
  header: { backgroundColor: '#071B3B', paddingHorizontal: 22, paddingTop: 14, paddingBottom: 22, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 36, height: 36, borderRadius: 13, backgroundColor: '#13C6D5', alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#071B3B', fontSize: 23, fontWeight: '900' },
  headerTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  headerEyebrow: { color: '#8FA8C7', fontSize: 9, fontWeight: '800', letterSpacing: 1.8, marginTop: 2 },
  headerSubtitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', marginTop: 18, letterSpacing: -0.4 },
  content: { padding: 20, paddingBottom: 32 },
  homeContent: { padding: 18, paddingBottom: 30 },
  welcomeCard: { backgroundColor: '#0B2A53', borderRadius: 24, padding: 20, minHeight: 180, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', marginBottom: 26 },
  welcomeCopy: { flex: 1, zIndex: 2, paddingRight: 6 },
  welcomeEyebrow: { color: '#42D6D8', fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginBottom: 9 },
  welcomeTitle: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', lineHeight: 30, letterSpacing: -0.7 },
  welcomeText: { color: '#C0D0E4', fontSize: 12, lineHeight: 18, marginTop: 9, maxWidth: 210 },
  welcomeIcon: { width: 76, height: 76, borderRadius: 25, backgroundColor: '#123F70', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '8deg' }], zIndex: 2 },
  welcomeEmoji: { fontSize: 38 },
  welcomeBubble: { position: 'absolute', width: 170, height: 170, borderRadius: 85, backgroundColor: '#123D68', right: -60, bottom: -95 },
  sectionHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 2 },
  heading: { fontSize: 19, fontWeight: '900', color: '#102A4C', marginBottom: 4, letterSpacing: -0.3 },
  muted: { color: '#7B8BA2', fontSize: 12, lineHeight: 18, marginBottom: 8 },
  sparkle: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#E1FAF8', alignItems: 'center', justifyContent: 'center' },
  sparkleText: { color: '#0AAAB7', fontSize: 20 },
  actionCard: { borderRadius: 21, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12, minHeight: 124, borderWidth: 1 },
  receptionCard: { backgroundColor: '#E9F8F7', borderColor: '#D3F0ED' },
  containerCard: { backgroundColor: '#EEF2FF', borderColor: '#E0E7FF' },
  actionIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  actionEmoji: { fontSize: 27 },
  actionCopy: { flex: 1 },
  actionTitle: { color: '#102A4C', fontSize: 16, fontWeight: '900', marginBottom: 4 },
  actionDescription: { color: '#647891', fontSize: 11, lineHeight: 16, marginBottom: 8 },
  actionLink: { color: '#079DA8', fontSize: 12, fontWeight: '900' },
  actionArrow: { color: '#7892AA', fontSize: 22, fontWeight: '700', alignSelf: 'flex-start' },
  seeAll: { color: '#079DA8', fontSize: 12, fontWeight: '900' },
  activityCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E9EEF5' },
  activityIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  activityEmoji: { fontSize: 21 },
  activityCopy: { flex: 1 },
  activityTitle: { color: '#102A4C', fontSize: 13, fontWeight: '900' },
  activitySubtitle: { color: '#8291A5', fontSize: 10, marginTop: 4 },
  countBadge: { minWidth: 30, height: 30, borderRadius: 11, backgroundColor: '#E1FAF8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  countText: { color: '#078F9A', fontWeight: '900' },
  label: { color: '#102A4C', fontWeight: '800', marginTop: 16, marginBottom: 8 },
  input: { backgroundColor: '#FFFFFF', borderColor: '#DDE6F0', borderWidth: 1, borderRadius: 15, padding: 15, fontSize: 16, color: '#102A4C' },
  button: { backgroundColor: '#08AEB9', padding: 15, borderRadius: 15, alignItems: 'center', marginTop: 12, shadowColor: '#079DA8', shadowOpacity: 0.16, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  buttonText: { color: '#06223F', fontSize: 14, fontWeight: '900' },
  secondaryButton: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE6F0', shadowOpacity: 0, elevation: 0 },
  secondaryButtonText: { color: '#183554' },
  disabledButton: { opacity: 0.45 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  chip: { borderWidth: 1, borderColor: '#DDE6F0', borderRadius: 18, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#FFFFFF' },
  chipSelected: { backgroundColor: '#0B2A53', borderColor: '#0B2A53' },
  chipText: { color: '#183554', fontWeight: '600' },
  chipSelectedText: { color: '#FFFFFF', fontWeight: '700' },
  reviewTop: { paddingHorizontal: 16, paddingTop: 10 },
  searchContainer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: '#F5F7FC' },
  searchInput: { backgroundColor: '#FFFFFF', borderColor: '#E1E8F0', borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: '#102A4C' },
  empty: { color: '#8291A5', textAlign: 'center', margin: 24, fontSize: 14 },
  photoGrid: { padding: 10, paddingBottom: 20 },
  photoCard: { flex: 1, margin: 6, padding: 8, backgroundColor: '#FFFFFF', borderRadius: 17, borderWidth: 1, borderColor: '#E9EEF5' },
  photo: { width: '100%', height: 150, borderRadius: 12, backgroundColor: '#E9EEF5' },
  photoName: { color: '#183554', fontSize: 11, marginTop: 7 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  switchText: { flex: 1, marginRight: 12 },
  deleteButton: { backgroundColor: '#FFF0F0', padding: 8, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  deleteText: { color: '#D04452', fontWeight: '800', fontSize: 12 },
  bottomActions: { padding: 14, backgroundColor: '#F5F7FC' },
  bottomNavigation: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EAF0F6', paddingTop: 7, paddingBottom: 7, paddingHorizontal: 5 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 15, marginHorizontal: 3 },
  navIcon: { color: '#9AA8B9', fontSize: 22, lineHeight: 26 },
  navLabel: { color: '#9AA8B9', fontSize: 10, fontWeight: '800', marginTop: 2 },
  navActive: { color: '#079DA8' },
  historyCard: { backgroundColor: '#FFFFFF', borderRadius: 17, padding: 16, marginBottom: 11, borderWidth: 1, borderColor: '#E9EEF5' },
  historyTitle: { color: '#102A4C', fontWeight: '900', fontSize: 17 },
  status: { color: '#079DA8', fontWeight: '800', marginVertical: 6, fontSize: 11 },
  cameraRoot: { flex: 1, backgroundColor: '#000000' },
  cameraTop: { position: 'absolute', top: 48, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cameraLabel: { color: '#FFFFFF', fontWeight: '700', backgroundColor: '#00000088', padding: 10, borderRadius: 12, flexShrink: 1 },
  cameraBottom: { position: 'absolute', bottom: 35, alignSelf: 'center', alignItems: 'center' },
  shutter: { width: 82, height: 82, borderRadius: 41, borderWidth: 5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#FFFFFF' },
  cameraHint: { color: '#FFFFFF', marginTop: 12, fontWeight: '700' },
  error: { color: '#D04452', marginVertical: 10 },
  reserved: { color: '#079DA8', fontWeight: '900', marginVertical: 10 },
  previewHero: { backgroundColor: '#E1FAF8', borderRadius: 21, padding: 22, alignItems: 'center', marginBottom: 16 },
  previewIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#08AEB9', color: '#06223F', textAlign: 'center', lineHeight: 46, fontSize: 23, fontWeight: '900', marginBottom: 10, overflow: 'hidden' },
  previewTitle: { color: '#102A4C', fontSize: 19, fontWeight: '900', marginBottom: 5 },
  summaryCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E9EEF5' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#EEF2F6' },
  summaryLabel: { color: '#8291A5', fontSize: 13 },
  summaryValue: { color: '#102A4C', fontWeight: '900', fontSize: 13 },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  previewImage: { width: '31%', aspectRatio: 1, margin: '1%', borderRadius: 13, backgroundColor: '#E9EEF5' },
  photoViewer: { ...StyleSheet.absoluteFill, zIndex: 10, backgroundColor: '#07111F', alignItems: 'center', justifyContent: 'center', padding: 18 },
  fullScreenImage: { width: '100%', height: '78%' },
  photoViewerClose: { position: 'absolute', top: 42, right: 20, zIndex: 11, width: 42, height: 42, borderRadius: 15, backgroundColor: '#FFFFFF33', alignItems: 'center', justifyContent: 'center' },
  photoViewerCloseText: { color: '#FFFFFF', fontSize: 32, fontWeight: '300', lineHeight: 36 },
  photoViewerName: { color: '#FFFFFF', fontSize: 12, marginTop: 16, textAlign: 'center' },
  settingCard: { backgroundColor: '#FFFFFF', borderRadius: 17, padding: 16, marginTop: 12, borderWidth: 1, borderColor: '#E9EEF5' },
  settingLabel: { color: '#8291A5', fontSize: 12, fontWeight: '800', marginBottom: 6 },
  settingValue: { color: '#102A4C', fontSize: 15, fontWeight: '900' },
  sectionCaption: { color: '#102A4C', fontSize: 16, fontWeight: '900', marginTop: 28, marginBottom: 8 },
  confirmationLabel: { color: '#102A4C', fontSize: 16, fontWeight: '900', marginTop: 22, marginBottom: 2 },
  confirmationHint: { color: '#8291A5', fontSize: 12, lineHeight: 18, marginTop: 8 },
  detailPhoto: { backgroundColor: '#FFFFFF', borderRadius: 17, padding: 10, marginTop: 12 },
  detailImage: { width: '100%', height: 210, borderRadius: 13, backgroundColor: '#E9EEF5' }
});
