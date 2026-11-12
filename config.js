// Configuração do Supabase (dados públicos do projeto; a segurança vem das regras do banco).
// NUNCA colocar aqui a chave secret / service_role.
window.APP_CONFIG = {
  supabaseUrl: "https://jzswsclpfexchffzrjgo.supabase.co",
  supabaseKey: "sb_publishable_LgTZ8oaBqDlo0rmCmNhD4g_h4ExELkv",
  // Login = só usuário + senha (decidido em 12/11). Por dentro: usuario@example.com.
  // Senha esquecida: o Gustavo pede no chat, e a senha é trocada no painel do Supabase.
  dominioLogin: "example.com"
};
