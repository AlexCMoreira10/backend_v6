import express from 'express';
import cors from 'cors';

/*imports de rotas*/
import testeRoutes from './routes/testeRoutes.js';
import userRoutes from './routes/userRoutes.js';
import livroRoutes from './routes/livroRoutes.js';
import trocaRoutes from './routes/trocaRoutes.js';
import notificacaoRoutes from './routes/notificacaoRoutes.js';
import mensagemRoutes from './routes/mensagemRoutes.js';
import seboRoutes from './routes/seboRoutes.js';
import melhorEnvioRoutes from './routes/melhorEnvioRoutes.js';

/*configurações*/
const app = express();
app.use(cors({
  exposedHeaders: [
    'X-Livros-Processados',
    'X-Livros-Cadastrados',
    'X-Livros-Rejeitados'
  ]
}));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('TESTE API RODANDO');
  console.log('REQUISIÇÃO RECEBIDA');
});

/*Rotas do app*/
app.use('/api', testeRoutes);
app.use('/api', userRoutes);
app.use('/api', livroRoutes);
app.use('/api', trocaRoutes);
app.use('/api', notificacaoRoutes);
app.use('/api', mensagemRoutes);
app.use('/api', seboRoutes);
app.use('/api', melhorEnvioRoutes);

export default app;
