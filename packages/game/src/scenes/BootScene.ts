import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'BootScene' });
  }

  create() {
    this.statusText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Connecting to server...', {
        color: '#ffffff',
        fontSize: '24px',
      })
      .setOrigin(0.5);
  }

  showError(message: string) {
    this.statusText.setText(message).setColor('#ff4455');
  }
}
